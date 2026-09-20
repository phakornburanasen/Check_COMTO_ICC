# CHECKCOM - Computer Inventory Dashboard

ระบบ CHECKCOM ใช้สำหรับเก็บข้อมูลเครื่องคอมพิวเตอร์ Windows เข้าฐานข้อมูล SQL Server และแสดงผลผ่านหน้า Dashboard สำหรับค้นหา, ตรวจสอบรายการเครื่อง, ผูกรหัสพนักงาน (`emp_id`) และ Export Excel

## ภาพรวมการทำงาน

```text
เครื่องลูกข่าย Windows
  -> RUN_CHECK_32.exe / RUN_CHECK_64.exe
  -> SQL Server database: Check_COMTO_ICC
  -> table: dbo.Agent_TNLX
  -> CHECKCOM Go API :10300
  -> React Dashboard /CHECKCOM/
```

ลำดับการทำงานหลัก:

1. รัน `RUN_CHECK` บนเครื่อง Windows ที่ต้องการเก็บข้อมูล
2. โปรแกรมอ่านข้อมูลเครื่อง เช่น hostname, IP, MAC address, user, Windows version, CPU, RAM, last boot time และ Office version
3. โปรแกรมเขียนข้อมูลลง `dbo.Agent_TNLX` โดยใช้ `mac_address` เป็นตัวอ้างอิงสำหรับ update/insert
4. Backend API อ่านข้อมูลจาก SQL Server และให้ frontend เรียกใช้งาน
5. Dashboard แสดงรายการเครื่อง, ค้นหา, แบ่งหน้า, แก้ไข `emp_id` และ export เป็น Excel

## โครงสร้างโปรเจกต์

```text
D:\Dev\Check_COMTO_ICC
|-- RUN_CHECK\              ตัวเก็บข้อมูลเครื่อง Windows
|-- backend\                Go API สำหรับ Dashboard
|-- frontend\               React + Vite + Tailwind Dashboard
|-- database\               SQL สำหรับสร้างฐานข้อมูลและตาราง
|-- Check_COMTO_ICC.sql     SQL schema สำเนาที่ root
`-- README.md               เอกสารภาพรวมระบบ
```

## ส่วนที่ 1: RUN_CHECK

ตำแหน่ง: `RUN_CHECK\`

หน้าที่:

- เก็บข้อมูลเครื่อง Windows ผ่าน PowerShell/CIM และ registry
- เลือก network adapter หลักจาก IPv4 และ gateway
- normalize MAC address เป็นตัวพิมพ์ใหญ่
- บันทึก `username` ในรูปแบบ `hostname\user`
- upsert ลง `dbo.Agent_TNLX` ด้วย `mac_address`
- ตั้ง `emp_id = NULL` ทุกครั้งที่ collector เขียนข้อมูล

ข้อมูลที่เก็บ:

- `hostname`
- `ip_address`
- `mac_address`
- `username`
- `windows_version`
- `cpu_name`
- `ram_total_gb`
- `last_boot_time`
- `last_seen`
- `office_version`
- `status_mac`

Build:

```powershell
cd D:\Dev\Check_COMTO_ICC\RUN_CHECK
.\build.bat
```

ผลลัพธ์:

```text
RUN_CHECK_32.exe
RUN_CHECK_64.exe
```

หมายเหตุ: `build.bat` ต้องใช้ `rsrc.exe` เพื่อฝังไอคอน `TNLX.ico`

ติดตั้ง `rsrc.exe` ถ้ายังไม่มี:

```powershell
go install github.com/akavel/rsrc@latest
```

Run:

```powershell
cd D:\Dev\Check_COMTO_ICC\RUN_CHECK
.\RUN_CHECK_64.exe
```

ทดสอบแบบไม่เขียนฐานข้อมูล:

```powershell
.\RUN_CHECK_64.exe -dry-run
```

ระบุ connection เอง:

```powershell
.\RUN_CHECK_64.exe -server 10.0.32.165 -database Check_COMTO_ICC -user sa -password <password>
```

## ส่วนที่ 2: Database

ตำแหน่ง SQL:

```text
database\Check_COMTO_ICC.sql
Check_COMTO_ICC.sql
```

ฐานข้อมูลหลัก:

```text
Check_COMTO_ICC
```

ตารางที่ schema เตรียมไว้:

- `dbo.Agent_TNLX` - ตารางหลักสำหรับข้อมูลเครื่องที่ Dashboard ใช้งาน
- `dbo.Agent_Disk` - ตารางข้อมูล disk ที่เตรียมไว้ใน schema
- `dbo.Agent_Software` - ตารางข้อมูล software ที่เตรียมไว้ใน schema
- `dbo.system_logs` - ตาราง log ระบบ
- `dbo.user_login` - ตารางผู้ใช้ระบบ

ตารางที่ collector และ dashboard ใช้งานหลักคือ `dbo.Agent_TNLX`

รัน schema ด้วย `sqlcmd`:

```powershell
sqlcmd -S 10.0.32.165 -U sa -P <password> -i D:\Dev\Check_COMTO_ICC\database\Check_COMTO_ICC.sql
```

## ส่วนที่ 3: Backend API

ตำแหน่ง: `backend\`

Backend เขียนด้วย Go และฟังที่:

```text
0.0.0.0:10300
```

API endpoints:

| Method | Path | หน้าที่ |
| --- | --- | --- |
| `GET` | `/api/health` | ตรวจสอบว่า API และ database ยังใช้งานได้ |
| `GET` | `/api/agents` | ดึงรายการเครื่องจาก `dbo.Agent_TNLX` |
| `PUT` | `/api/agents/{id}/emp-id` | อัปเดต `emp_id` ของเครื่องตาม `id` |
| `GET` | `/api/export` | Export Excel ชื่อ `list_CHECKCOM.xlsx` |

Run backend:

```powershell
cd D:\Dev\Check_COMTO_ICC\backend
go run .
```

Build backend:

```powershell
cd D:\Dev\Check_COMTO_ICC\backend
.\build.bat
```

ผลลัพธ์:

```text
backend\dist\CHECKCOM_API.exe   windows/amd64
backend\dist\CHECKCOM_API       linux/amd64
```

ทดสอบ API:

```powershell
curl.exe http://localhost:10300/api/health
curl.exe http://localhost:10300/api/agents
```

ตัวอย่างอัปเดต `emp_id`:

```powershell
curl.exe -X PUT http://localhost:10300/api/agents/1/emp-id `
  -H "Content-Type: application/json" `
  -d "{\"emp_id\":\"T12345\"}"
```

## ส่วนที่ 4: Frontend Dashboard

ตำแหน่ง: `frontend\`

Frontend ใช้ React, Vite, Tailwind CSS และ lucide-react

ค่า dev server:

```text
host: 0.0.0.0
port: 3000
base: /CHECKCOM/
```

Frontend จะเรียก API จาก host เดียวกับหน้าเว็บ แต่เปลี่ยน port เป็น `10300`:

```text
http://<dashboard-host>:10300
```

Run frontend:

```powershell
cd D:\Dev\Check_COMTO_ICC\frontend
npm install
npm run dev
```

เปิดใช้งาน:

```text
http://localhost:3000/CHECKCOM/
```

หรือจากเครื่องอื่นใน network:

```text
http://<server-ip>:3000/CHECKCOM/
```

Build frontend:

```powershell
cd D:\Dev\Check_COMTO_ICC\frontend
npm run build
```

ถ้า PowerShell ติด execution policy ให้ใช้:

```powershell
npm.cmd run build
```

## ความสามารถบน Dashboard

- แสดงจำนวนเครื่องทั้งหมด
- แสดงจำนวนเครื่องที่มี/ไม่มี `emp_id`
- ค้นหาจาก hostname, IP, MAC, username, Windows version, CPU และ `emp_id`
- เลือก page size ได้ 10, 25, 50, 100
- แก้ไข `emp_id` ผ่าน modal
- Export Excel ทั้งชุดข้อมูล ไม่ใช่เฉพาะหน้าปัจจุบัน

## Export Excel

ปุ่ม Export จะเรียก:

```text
GET /api/export
```

ไฟล์ที่ได้:

```text
list_CHECKCOM.xlsx
```

ข้อมูล export มาจาก `dbo.Agent_TNLX` ทั้งหมด และ backend จะเติมข้อมูลชื่อพนักงานจาก employee API เมื่อ record นั้นมี `emp_id`

คอลัมน์ใน Excel:

- `No.`
- `hostname`
- `ip_address`
- `mac_address`
- `username`
- `windows_version`
- `cpu_name`
- `ram_total_gb`
- `emp_id`
- `info_name, info_surname`
- `info_nickname`
- `created_at`

รูปแบบไฟล์ใช้ font `Century` ขนาด 10 และ freeze header row

## จุดสำคัญที่ต้องระวัง

- `RUN_CHECK` จะเขียนเฉพาะข้อมูลเครื่องลง `Agent_TNLX`
- การ upsert ใช้ `mac_address` เป็น key หลักในการหา record เดิม
- ตอน collector เขียนข้อมูล จะตั้ง `emp_id = NULL`
- ถ้าต้องการผูกเครื่องกับพนักงาน ให้แก้ `emp_id` จากหน้า Dashboard หลังเก็บข้อมูลแล้ว
- Backend ใช้ SQL Server `10.0.32.165` และ database `Check_COMTO_ICC` ตามค่าที่อยู่ใน source code
- Frontend production path ใช้ `/CHECKCOM/` จึงต้องตั้งค่า web server ให้รองรับ path นี้
- ถ้าเข้าหน้า Dashboard จาก IP อื่น ต้องให้เครื่อง client เข้าถึง port `10300` ของ backend ได้ด้วย

## คำสั่งตรวจสอบเร็ว

ตรวจ backend:

```powershell
curl.exe http://localhost:10300/api/health
```

ตรวจจำนวน record:

```powershell
curl.exe http://localhost:10300/api/agents
```

ตรวจ collector โดยไม่เขียน DB:

```powershell
cd D:\Dev\Check_COMTO_ICC\RUN_CHECK
.\RUN_CHECK_64.exe -dry-run
```

Build ทุกส่วน:

```powershell
cd D:\Dev\Check_COMTO_ICC\RUN_CHECK
.\build.bat

cd D:\Dev\Check_COMTO_ICC\backend
.\build.bat

cd D:\Dev\Check_COMTO_ICC\frontend
npm.cmd run build
```
