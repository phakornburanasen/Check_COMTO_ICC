package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	_ "github.com/denisenkom/go-mssqldb"
	"github.com/xuri/excelize/v2"
)

const (
	listenAddr       = "0.0.0.0:10300"
	dbServer         = "10.0.32.165"
	dbName           = "Check_COMTO_ICC"
	dbUser           = "sa"
	dbPassword       = "Thanulux2569"
	exportFileName   = "list_CHECKCOM.xlsx"
	employeeEndpoint = "http://10.0.32.202:3030/api_local/_survey_employee.php"
)

type app struct {
	db         *sql.DB
	httpClient *http.Client
}

type agentRecord struct {
	ID             int      `json:"id"`
	Hostname       string   `json:"hostname"`
	IPAddress      string   `json:"ip_address"`
	MACAddress     string   `json:"mac_address"`
	Username       string   `json:"username"`
	WindowsVersion string   `json:"windows_version"`
	CPUName        string   `json:"cpu_name"`
	RAMTotalGB     *float64 `json:"ram_total_gb"`
	EmpID          string   `json:"emp_id"`
	CreatedAt      string   `json:"created_at"`
}

type updateEmpRequest struct {
	EmpID string `json:"emp_id"`
}

type employeeAPIResponse struct {
	Value []employeeInfo `json:"value"`
	Count int            `json:"Count"`
}

type employeeInfo struct {
	InfoName     string `json:"info_name"`
	InfoSurname  string `json:"info_surname"`
	InfoNickname string `json:"info_nickname"`
}

func main() {
	db, err := sql.Open("sqlserver", connectionString())
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("connect database: %v", err)
	}

	a := &app{
		db: db,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", a.handleHealth)
	mux.HandleFunc("/api/agents", a.handleAgents)
	mux.HandleFunc("/api/agents/", a.handleAgentByID)
	mux.HandleFunc("/api/export", a.handleExport)

	log.Printf("CHECKCOM API listening on %s", listenAddr)
	if err := http.ListenAndServe(listenAddr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func connectionString() string {
	values := url.Values{}
	values.Set("server", dbServer)
	values.Set("database", dbName)
	values.Set("user id", dbUser)
	values.Set("password", dbPassword)
	values.Set("encrypt", "disable")
	values.Set("connection timeout", "15")
	return "sqlserver://?" + values.Encode()
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := a.db.PingContext(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *app) handleAgents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	records, err := a.listAgents(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, records)
}

func (a *app) handleAgentByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	id, err := parseAgentID(r.URL.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateEmpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}

	empID := strings.ToUpper(strings.TrimSpace(req.EmpID))
	if len(empID) > 20 {
		writeError(w, http.StatusBadRequest, "emp_id must be 20 characters or less")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	record, err := a.updateEmpID(ctx, id, empID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "agent not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, record)
}

func (a *app) handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	records, err := a.listAgents(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	file, err := a.buildExcel(ctx, records)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="`+exportFileName+`"`)
	w.Header().Set("Cache-Control", "no-store")
	if err := file.Write(w); err != nil {
		log.Printf("write export: %v", err)
	}
}

func (a *app) listAgents(ctx context.Context) ([]agentRecord, error) {
	rows, err := a.db.QueryContext(ctx, `
SELECT
    id,
    hostname,
    ip_address,
    mac_address,
    username,
    windows_version,
    cpu_name,
    ram_total_gb,
    emp_id,
    created_at
FROM dbo.Agent_TNLX
ORDER BY created_at DESC, id DESC;
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]agentRecord, 0)
	for rows.Next() {
		var record agentRecord
		var hostname, ipAddress, macAddress, username, windowsVersion, cpuName, empID sql.NullString
		var ram sql.NullFloat64
		var createdAt sql.NullTime

		if err := rows.Scan(
			&record.ID,
			&hostname,
			&ipAddress,
			&macAddress,
			&username,
			&windowsVersion,
			&cpuName,
			&ram,
			&empID,
			&createdAt,
		); err != nil {
			return nil, err
		}

		record.Hostname = hostname.String
		record.IPAddress = ipAddress.String
		record.MACAddress = macAddress.String
		record.Username = username.String
		record.WindowsVersion = windowsVersion.String
		record.CPUName = cpuName.String
		record.EmpID = empID.String
		if ram.Valid {
			value := ram.Float64
			record.RAMTotalGB = &value
		}
		if createdAt.Valid {
			record.CreatedAt = createdAt.Time.Format("2006-01-02 15:04:05")
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (a *app) updateEmpID(ctx context.Context, id int, empID string) (agentRecord, error) {
	var empValue any
	if empID != "" {
		empValue = empID
	}

	result, err := a.db.ExecContext(ctx, `
UPDATE dbo.Agent_TNLX
SET emp_id = @p1,
    updated_at = GETDATE()
WHERE id = @p2;
`, empValue, id)
	if err != nil {
		return agentRecord{}, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return agentRecord{}, err
	}
	if rowsAffected == 0 {
		return agentRecord{}, sql.ErrNoRows
	}

	return a.getAgent(ctx, id)
}

func (a *app) getAgent(ctx context.Context, id int) (agentRecord, error) {
	rows, err := a.db.QueryContext(ctx, `
SELECT
    id,
    hostname,
    ip_address,
    mac_address,
    username,
    windows_version,
    cpu_name,
    ram_total_gb,
    emp_id,
    created_at
FROM dbo.Agent_TNLX
WHERE id = @p1;
`, id)
	if err != nil {
		return agentRecord{}, err
	}
	defer rows.Close()

	records, err := scanAgentRows(rows)
	if err != nil {
		return agentRecord{}, err
	}
	if len(records) == 0 {
		return agentRecord{}, sql.ErrNoRows
	}
	return records[0], nil
}

func scanAgentRows(rows *sql.Rows) ([]agentRecord, error) {
	records := make([]agentRecord, 0)
	for rows.Next() {
		var record agentRecord
		var hostname, ipAddress, macAddress, username, windowsVersion, cpuName, empID sql.NullString
		var ram sql.NullFloat64
		var createdAt sql.NullTime
		if err := rows.Scan(&record.ID, &hostname, &ipAddress, &macAddress, &username, &windowsVersion, &cpuName, &ram, &empID, &createdAt); err != nil {
			return nil, err
		}
		record.Hostname = hostname.String
		record.IPAddress = ipAddress.String
		record.MACAddress = macAddress.String
		record.Username = username.String
		record.WindowsVersion = windowsVersion.String
		record.CPUName = cpuName.String
		record.EmpID = empID.String
		if ram.Valid {
			value := ram.Float64
			record.RAMTotalGB = &value
		}
		if createdAt.Valid {
			record.CreatedAt = createdAt.Time.Format("2006-01-02 15:04:05")
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func parseAgentID(path string) (int, error) {
	const prefix = "/api/agents/"
	const suffix = "/emp-id"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return 0, errors.New("invalid agent endpoint")
	}
	rawID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	id, err := strconv.Atoi(rawID)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid agent id")
	}
	return id, nil
}

func (a *app) buildExcel(ctx context.Context, records []agentRecord) (*excelize.File, error) {
	file := excelize.NewFile()
	sheet := "Agent_TNLX"
	index, err := file.NewSheet(sheet)
	if err != nil {
		return nil, err
	}
	file.DeleteSheet("Sheet1")
	file.SetActiveSheet(index)

	headers := []string{
		"No.",
		"hostname",
		"ip_address",
		"mac_address",
		"username",
		"windows_version",
		"cpu_name",
		"ram_total_gb",
		"emp_id",
		"info_name, info_surname",
		"info_nickname",
		"created_at",
	}
	for i, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		file.SetCellValue(sheet, cell, header)
	}

	lastRow := len(records) + 1
	if lastRow < 1 {
		lastRow = 1
	}
	lastCell, _ := excelize.CoordinatesToCellName(len(headers), lastRow)
	sheetStyle, _ := file.NewStyle(&excelize.Style{
		Font: &excelize.Font{Family: "Century", Size: 10},
	})
	file.SetCellStyle(sheet, "A1", lastCell, sheetStyle)

	headerStyle, _ := file.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Family: "Century", Size: 10, Bold: true, Color: "FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"1E293B"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	file.SetCellStyle(sheet, "A1", "L1", headerStyle)

	employeeCache := make(map[string]employeeInfo)
	for rowIndex, record := range records {
		excelRow := rowIndex + 2
		fullName := ""
		nickname := ""

		empID := strings.TrimSpace(record.EmpID)
		if empID != "" {
			info, ok := employeeCache[empID]
			if !ok {
				info, _ = a.fetchEmployeeInfo(ctx, empID)
				employeeCache[empID] = info
			}
			fullName = strings.TrimSpace(info.InfoName + " " + info.InfoSurname)
			nickname = info.InfoNickname
		}

		values := []any{
			rowIndex + 1,
			record.Hostname,
			record.IPAddress,
			record.MACAddress,
			record.Username,
			record.WindowsVersion,
			record.CPUName,
			nullableFloat(record.RAMTotalGB),
			record.EmpID,
			fullName,
			nickname,
			record.CreatedAt,
		}
		for colIndex, value := range values {
			cell, _ := excelize.CoordinatesToCellName(colIndex+1, excelRow)
			file.SetCellValue(sheet, cell, value)
		}
	}

	widths := map[string]float64{
		"A": 10, "B": 22, "C": 18, "D": 20, "E": 24, "F": 34,
		"G": 36, "H": 14, "I": 14, "J": 28, "K": 18, "L": 22,
	}
	for column, width := range widths {
		file.SetColWidth(sheet, column, column, width)
	}
	file.SetPanes(sheet, &excelize.Panes{
		Freeze:      true,
		Split:       false,
		XSplit:      0,
		YSplit:      1,
		TopLeftCell: "A2",
		ActivePane:  "bottomLeft",
	})

	return file, nil
}

func nullableFloat(value *float64) any {
	if value == nil {
		return ""
	}
	return *value
}

func (a *app) fetchEmployeeInfo(ctx context.Context, empID string) (employeeInfo, error) {
	requestURL, err := url.Parse(employeeEndpoint)
	if err != nil {
		return employeeInfo{}, err
	}
	values := requestURL.Query()
	values.Set("Action", "GetEmployeeData")
	values.Set("emp_id", empID)
	values.Set("token", base64.StdEncoding.EncodeToString([]byte(empID)))
	requestURL.RawQuery = values.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL.String(), nil)
	if err != nil {
		return employeeInfo{}, err
	}

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return employeeInfo{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return employeeInfo{}, fmt.Errorf("employee api status %d", resp.StatusCode)
	}

	var raw json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return employeeInfo{}, err
	}

	var list []employeeInfo
	if err := json.Unmarshal(raw, &list); err == nil {
		if len(list) == 0 {
			return employeeInfo{}, nil
		}
		return list[0], nil
	}

	var payload employeeAPIResponse
	if err := json.Unmarshal(raw, &payload); err != nil {
		return employeeInfo{}, fmt.Errorf("decode employee api %s: %w", hex.EncodeToString(raw), err)
	}
	if payload.Count == 0 || len(payload.Value) == 0 {
		return employeeInfo{}, nil
	}
	return payload.Value[0], nil
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("write json: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
