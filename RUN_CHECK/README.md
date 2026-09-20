# RUN_CHECK

Windows runner for collecting local computer information and upserting it into
`dbo.Agent_TNLX` in SQL Server database `Check_COMTO_ICC`.

## Build

```bat
build.bat
```

Outputs:

- `RUN_CHECK_32.exe`
- `RUN_CHECK_64.exe`

The build embeds `TNLX.ico` into both executables.

## Run

```bat
RUN_CHECK_64.exe
```

Default connection:

- server: `10.0.32.165`
- database: `Check_COMTO_ICC`
- user: `sa`

To preview without writing to SQL Server:

```bat
RUN_CHECK_64.exe -dry-run
```

Connection values can be overridden:

```bat
RUN_CHECK_64.exe -server 10.0.32.165 -database Check_COMTO_ICC -user sa -password Thanulux2569
```
