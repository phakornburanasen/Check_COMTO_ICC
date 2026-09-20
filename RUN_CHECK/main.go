package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/url"
	"os"
	"os/exec"
	"os/user"
	"runtime"
	"strconv"
	"strings"
	"time"

	_ "github.com/denisenkom/go-mssqldb"
)

const (
	defaultServer   = "10.0.32.165"
	defaultDatabase = "Check_COMTO_ICC"
	defaultUser     = "sa"
	defaultPassword = "Thanulux2569"
)

type config struct {
	Server   string
	Database string
	User     string
	Password string
	DryRun   bool
}

type computerInfo struct {
	Hostname       string
	IPAddress      string
	MACAddress     string
	Username       string
	WindowsVersion string
	CPUName        string
	RAMTotalGB     float64
	LastBootTime   time.Time
	OfficeVersion  string
}

type osInfo struct {
	Caption            string `json:"Caption"`
	Version            string `json:"Version"`
	LastBootUpTime     string `json:"LastBootUpTime"`
	TotalVisibleMemory string `json:"TotalVisibleMemorySize"`
}

type cpuInfo struct {
	Name string `json:"Name"`
}

type networkInfo struct {
	IPAddress  string `json:"IPAddress"`
	MACAddress string `json:"MACAddress"`
	HasGateway bool   `json:"HasGateway"`
}

func main() {
	cfg := parseFlags()

	info, err := collectComputerInfo()
	if err != nil {
		exitWithError("collect computer info", err)
	}

	printInfo(info)

	if cfg.DryRun {
		fmt.Println("DRY-RUN: skip database write")
		return
	}

	if strings.TrimSpace(info.MACAddress) == "" {
		exitWithError("validate mac address", errors.New("mac_address is empty; cannot upsert Agent_TNLX"))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := sql.Open("sqlserver", connectionString(cfg))
	if err != nil {
		exitWithError("open database", err)
	}
	defer db.Close()

	fmt.Printf("Connecting SQL Server %s / database %s ...\n", cfg.Server, cfg.Database)
	if err := db.PingContext(ctx); err != nil {
		exitWithError("connect database", err)
	}
	fmt.Println("Database connected")

	action, err := upsertAgentTNLX(ctx, db, info)
	if err != nil {
		exitWithError("write Agent_TNLX", err)
	}
	fmt.Printf("Agent_TNLX %s successfully\n", action)
}

func parseFlags() config {
	cfg := config{}
	flag.StringVar(&cfg.Server, "server", defaultServer, "SQL Server host or host\\instance")
	flag.StringVar(&cfg.Database, "database", defaultDatabase, "SQL Server database name")
	flag.StringVar(&cfg.User, "user", defaultUser, "SQL Server username")
	flag.StringVar(&cfg.Password, "password", defaultPassword, "SQL Server password")
	flag.BoolVar(&cfg.DryRun, "dry-run", false, "collect and print data without writing to database")
	flag.Parse()
	return cfg
}

func collectComputerInfo() (computerInfo, error) {
	hostname, _ := os.Hostname()
	username := formatHostUsername(hostname, currentUsername())

	osData, err := getOSInfo()
	if err != nil {
		return computerInfo{}, err
	}

	cpuName, err := getCPUName()
	if err != nil {
		return computerInfo{}, err
	}

	netData, err := getPrimaryNetwork()
	if err != nil {
		return computerInfo{}, err
	}

	lastBoot, err := parseWindowsTime(osData.LastBootUpTime)
	if err != nil {
		return computerInfo{}, fmt.Errorf("parse last boot time %q: %w", osData.LastBootUpTime, err)
	}

	totalKB, _ := strconv.ParseFloat(strings.TrimSpace(osData.TotalVisibleMemory), 64)
	ramGB := totalKB / 1024 / 1024

	windowsVersion := strings.TrimSpace(osData.Caption)
	if strings.TrimSpace(osData.Version) != "" {
		windowsVersion = strings.TrimSpace(windowsVersion + " " + osData.Version)
	}

	return computerInfo{
		Hostname:       trimTo(hostname, 100),
		IPAddress:      trimTo(netData.IPAddress, 50),
		MACAddress:     trimTo(normalizeMAC(netData.MACAddress), 50),
		Username:       trimTo(username, 100),
		WindowsVersion: trimTo(windowsVersion, 255),
		CPUName:        trimTo(cpuName, 255),
		RAMTotalGB:     round2(ramGB),
		LastBootTime:   lastBoot,
		OfficeVersion:  trimTo(getOfficeVersion(), 255),
	}, nil
}

func getOSInfo() (osInfo, error) {
	script := `
$os = Get-CimInstance Win32_OperatingSystem
[pscustomobject]@{
  Caption = [string]$os.Caption
  Version = [string]$os.Version
  LastBootUpTime = $os.LastBootUpTime.ToString('o')
  TotalVisibleMemorySize = [string]$os.TotalVisibleMemorySize
} | ConvertTo-Json -Compress
`
	var info osInfo
	if err := runPowerShellJSON(script, &info); err != nil {
		return osInfo{}, err
	}
	return info, nil
}

func getCPUName() (string, error) {
	script := `
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
[pscustomobject]@{ Name = [string]$cpu.Name } | ConvertTo-Json -Compress
`
	var info cpuInfo
	if err := runPowerShellJSON(script, &info); err != nil {
		return "", err
	}
	return strings.TrimSpace(info.Name), nil
}

func getPrimaryNetwork() (networkInfo, error) {
	script := `
$items = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" |
  ForEach-Object {
    $ipv4 = @($_.IPAddress | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' }) | Select-Object -First 1
    if ($ipv4) {
      [pscustomobject]@{
        IPAddress = [string]$ipv4
        MACAddress = [string]$_.MACAddress
        HasGateway = [bool]($_.DefaultIPGateway -and @($_.DefaultIPGateway).Count -gt 0)
      }
    }
  } | Sort-Object HasGateway -Descending | Select-Object -First 1
$items | ConvertTo-Json -Compress
`
	var info networkInfo
	if err := runPowerShellJSON(script, &info); err == nil && strings.TrimSpace(info.MACAddress) != "" {
		return info, nil
	}
	return fallbackNetworkInfo()
}

func runPowerShellJSON(script string, target any) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, powershellPath(), "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	output, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return errors.New("PowerShell command timed out")
	}
	if err != nil {
		return fmt.Errorf("PowerShell command failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	text := strings.TrimSpace(string(output))
	if text == "" || text == "null" {
		return errors.New("PowerShell returned empty JSON")
	}
	if err := json.Unmarshal([]byte(text), target); err != nil {
		return fmt.Errorf("decode PowerShell JSON %q: %w", text, err)
	}
	return nil
}

func powershellPath() string {
	if windir := os.Getenv("WINDIR"); windir != "" {
		sysnative := windir + `\Sysnative\WindowsPowerShell\v1.0\powershell.exe`
		if _, err := os.Stat(sysnative); err == nil {
			return sysnative
		}

		system32 := windir + `\System32\WindowsPowerShell\v1.0\powershell.exe`
		if _, err := os.Stat(system32); err == nil {
			return system32
		}
	}
	return "powershell.exe"
}

func fallbackNetworkInfo() (networkInfo, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return networkInfo{}, err
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 || len(iface.HardwareAddr) == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ip := ipv4FromAddr(addr)
			if ip != "" {
				return networkInfo{IPAddress: ip, MACAddress: iface.HardwareAddr.String()}, nil
			}
		}
	}
	return networkInfo{}, errors.New("no active IPv4 network adapter found")
}

func ipv4FromAddr(addr net.Addr) string {
	var ip net.IP
	switch v := addr.(type) {
	case *net.IPNet:
		ip = v.IP
	case *net.IPAddr:
		ip = v.IP
	default:
		return ""
	}
	ip4 := ip.To4()
	if ip4 == nil || ip4.IsLoopback() {
		return ""
	}
	return ip4.String()
}

func currentUsername() string {
	if u, err := user.Current(); err == nil {
		if idx := strings.LastIndex(u.Username, `\`); idx >= 0 {
			return u.Username[idx+1:]
		}
		return u.Username
	}
	if username := os.Getenv("USERNAME"); username != "" {
		return username
	}
	return os.Getenv("USER")
}

func formatHostUsername(hostname, username string) string {
	hostname = strings.TrimSpace(hostname)
	username = strings.TrimSpace(username)
	if hostname == "" || username == "" {
		return username
	}
	return hostname + `\` + username
}

func getOfficeVersion() string {
	candidates := []string{
		`HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration`,
		`HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\ClickToRun\Configuration`,
		`HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ProductVersion`,
		`HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\16.0\Common\ProductVersion`,
		`HKLM:\SOFTWARE\Microsoft\Office\15.0\Common\ProductVersion`,
		`HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\15.0\Common\ProductVersion`,
		`HKLM:\SOFTWARE\Microsoft\Office\14.0\Common\ProductVersion`,
		`HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\14.0\Common\ProductVersion`,
	}
	paths := "'" + strings.Join(candidates, "','") + "'"
	script := fmt.Sprintf(`
$paths = @(%s)
foreach ($path in $paths) {
  if (Test-Path $path) {
    $p = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue
    foreach ($name in @('VersionToReport','ProductVersion','ClientVersionToReport')) {
      if ($p.$name) {
        [pscustomobject]@{ Version = [string]$p.$name } | ConvertTo-Json -Compress
        exit 0
      }
    }
  }
}
[pscustomobject]@{ Version = '' } | ConvertTo-Json -Compress
`, paths)

	var result struct {
		Version string `json:"Version"`
	}
	if err := runPowerShellJSON(script, &result); err != nil {
		return ""
	}
	return strings.TrimSpace(result.Version)
}

func parseWindowsTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, errors.New("empty time")
	}
	layouts := []string{
		time.RFC3339Nano,
		"2006-01-02T15:04:05.9999999-07:00",
		"2006-01-02T15:04:05-07:00",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, value); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unsupported format")
}

func connectionString(cfg config) string {
	q := url.Values{}
	q.Set("server", cfg.Server)
	q.Set("database", cfg.Database)
	q.Set("user id", cfg.User)
	q.Set("password", cfg.Password)
	q.Set("encrypt", "disable")
	q.Set("connection timeout", "15")
	return "sqlserver://" + "?" + q.Encode()
}

func upsertAgentTNLX(ctx context.Context, db *sql.DB, info computerInfo) (string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	updateResult, err := tx.ExecContext(ctx, `
UPDATE dbo.Agent_TNLX
SET
    hostname = @p1,
    ip_address = @p2,
    username = @p3,
    windows_version = @p4,
    cpu_name = @p5,
    emp_id = NULL,
    ram_total_gb = @p6,
    last_boot_time = @p7,
    last_seen = GETDATE(),
    updated_at = GETDATE(),
    office_version = @p8
WHERE mac_address = @p9;
`,
		info.Hostname,
		info.IPAddress,
		info.Username,
		info.WindowsVersion,
		info.CPUName,
		info.RAMTotalGB,
		info.LastBootTime,
		info.OfficeVersion,
		info.MACAddress,
	)
	if err != nil {
		return "", err
	}

	rows, err := updateResult.RowsAffected()
	if err != nil {
		return "", err
	}

	action := "updated"
	if rows == 0 {
		_, err = tx.ExecContext(ctx, `
INSERT INTO dbo.Agent_TNLX
    (hostname, ip_address, mac_address, username, windows_version, cpu_name, emp_id, ram_total_gb, last_boot_time, last_seen, created_at, updated_at, status_mac, office_version)
VALUES
    (@p1, @p2, @p3, @p4, @p5, @p6, NULL, @p7, @p8, GETDATE(), GETDATE(), GETDATE(), '1', @p9);
`,
			info.Hostname,
			info.IPAddress,
			info.MACAddress,
			info.Username,
			info.WindowsVersion,
			info.CPUName,
			info.RAMTotalGB,
			info.LastBootTime,
			info.OfficeVersion,
		)
		if err != nil {
			return "", err
		}
		action = "inserted"
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}
	return action, nil
}

func printInfo(info computerInfo) {
	fmt.Println("Collected computer info")
	fmt.Printf("  hostname        : %s\n", info.Hostname)
	fmt.Printf("  ip_address      : %s\n", info.IPAddress)
	fmt.Printf("  mac_address     : %s\n", info.MACAddress)
	fmt.Printf("  username        : %s\n", info.Username)
	fmt.Printf("  windows_version : %s\n", info.WindowsVersion)
	fmt.Printf("  cpu_name        : %s\n", info.CPUName)
	fmt.Printf("  ram_total_gb    : %.2f\n", info.RAMTotalGB)
	fmt.Printf("  last_boot_time  : %s\n", info.LastBootTime.Format("2006-01-02 15:04:05"))
	fmt.Printf("  office_version  : %s\n", info.OfficeVersion)
	fmt.Printf("  runtime         : %s/%s\n", runtime.GOOS, runtime.GOARCH)
	fmt.Println("  emp_id          : NULL")
}

func normalizeMAC(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "-", ":")
	return strings.ToUpper(value)
}

func trimTo(value string, max int) string {
	value = strings.TrimSpace(value)
	if len(value) <= max {
		return value
	}
	return value[:max]
}

func round2(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}

func exitWithError(step string, err error) {
	fmt.Fprintf(os.Stderr, "ERROR: %s: %v\n", step, err)
	os.Exit(1)
}
