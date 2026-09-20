/* ============================================================
   Create Database : Check_COMTO_ICC
   Source Structure: Agent_tnlx
   SQL Server
   ============================================================ */

USE [master];
GO

/* ============================================================
   1. Create Database
   ============================================================ */

IF DB_ID(N'Check_COMTO_ICC') IS NULL
BEGIN
    CREATE DATABASE [Check_COMTO_ICC];
    PRINT 'Database Check_COMTO_ICC created successfully.';
END
ELSE
BEGIN
    PRINT 'Database Check_COMTO_ICC already exists.';
END
GO

/* ============================================================
   2. Use New Database
   ============================================================ */

USE [Check_COMTO_ICC];
GO

/* ============================================================
   3. Agent_Disk
   ============================================================ */

IF OBJECT_ID(N'dbo.Agent_Disk', N'U') IS NULL
BEGIN

    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;
    SET ANSI_PADDING ON;

    CREATE TABLE [dbo].[Agent_Disk]
    (
        [id]            [int] IDENTITY(1,1) NOT NULL,
        [hostname]      [varchar](100) NULL,
        [drive_letter]  [varchar](10) NULL,
        [file_system]   [varchar](50) NULL,
        [model]         [varchar](255) NULL,
        [serial_number] [varchar](255) NULL,
        [disk_type]     [varchar](50) NULL,
        [smart_health]  [varchar](50) NULL,
        [total_gb]      [decimal](10,2) NULL,
        [free_gb]       [decimal](10,2) NULL,
        [used_gb]       [decimal](10,2) NULL,
        [used_percent]  [decimal](10,2) NULL,
        [capacity_stat] [varchar](50) NULL,
        [Type]          [varchar](20) NULL,
        [created_at]    [datetime] NULL
            CONSTRAINT [DF_Agent_Disk_created_at]
            DEFAULT (GETDATE()),

        CONSTRAINT [PK_Agent_Disk]
            PRIMARY KEY CLUSTERED ([id] ASC)
    )
    ON [PRIMARY];

    PRINT 'Table Agent_Disk created successfully.';
END
GO

/* ============================================================
   4. Agent_Software
   ============================================================ */

IF OBJECT_ID(N'dbo.Agent_Software', N'U') IS NULL
BEGIN

    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;
    SET ANSI_PADDING ON;

    CREATE TABLE [dbo].[Agent_Software]
    (
        [id]               [int] IDENTITY(1,1) NOT NULL,
        [hostname]         [varchar](100) NULL,
        [software_name]    [varchar](500) NULL,
        [software_version] [varchar](100) NULL,
        [created_at]       [datetime] NULL
            CONSTRAINT [DF_Agent_Software_created_at]
            DEFAULT (GETDATE()),

        CONSTRAINT [PK_Agent_Software]
            PRIMARY KEY CLUSTERED ([id] ASC)
    )
    ON [PRIMARY];

    PRINT 'Table Agent_Software created successfully.';
END
GO

/* ============================================================
   5. Agent_TNLX
   ============================================================ */

IF OBJECT_ID(N'dbo.Agent_TNLX', N'U') IS NULL
BEGIN

    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;
    SET ANSI_PADDING ON;

    CREATE TABLE [dbo].[Agent_TNLX]
    (
        [id]               [int] IDENTITY(1,1) NOT NULL,
        [hostname]         [varchar](100) NULL,
        [ip_address]       [varchar](50) NULL,
        [mac_address]      [varchar](50) NULL,
        [username]         [varchar](100) NULL,
        [windows_version]  [varchar](255) NULL,
        [cpu_name]         [varchar](255) NULL,
		[emp_id]         [varchar](20) NULL,
        [ram_total_gb]     [decimal](10,2) NULL,
        [last_boot_time]   [datetime] NULL,

        [last_seen]        [datetime] NULL
            CONSTRAINT [DF_Agent_TNLX_last_seen]
            DEFAULT (GETDATE()),

        [created_at]       [datetime] NULL
            CONSTRAINT [DF_Agent_TNLX_created_at]
            DEFAULT (GETDATE()),

        [updated_at]       [datetime] NULL
            CONSTRAINT [DF_Agent_TNLX_updated_at]
            DEFAULT (GETDATE()),

        [status_mac]       [varchar](1) NULL,
        [office_version]   [varchar](255) NULL,

        CONSTRAINT [PK_Agent_TNLX]
            PRIMARY KEY CLUSTERED ([id] ASC)
    )
    ON [PRIMARY];

    PRINT 'Table Agent_TNLX created successfully.';
END
GO

/* ============================================================
   6. system_logs
   ============================================================ */

IF OBJECT_ID(N'dbo.system_logs', N'U') IS NULL
BEGIN

    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    CREATE TABLE [dbo].[system_logs]
    (
        [id]              [bigint] IDENTITY(1,1) NOT NULL,

        [log_time]        [datetime2](7) NOT NULL
            CONSTRAINT [DF_system_logs_log_time]
            DEFAULT (GETDATE()),

        [username]        [nvarchar](100) NULL,
        [display_name]    [nvarchar](255) NULL,
        [role_name]       [nvarchar](50) NULL,
        [action]          [nvarchar](100) NOT NULL,
        [module]          [nvarchar](100) NULL,
        [description]     [nvarchar](max) NULL,
        [ip_address]      [nvarchar](50) NULL,
        [computer_name]   [nvarchar](100) NULL,
        [user_agent]      [nvarchar](500) NULL,
        [request_method]  [nvarchar](10) NULL,
        [endpoint]        [nvarchar](255) NULL,
        [status_code]     [int] NULL,
        [created_by]      [nvarchar](100) NULL,

        CONSTRAINT [PK_system_logs]
            PRIMARY KEY CLUSTERED ([id] ASC)
    )
    ON [PRIMARY]
    TEXTIMAGE_ON [PRIMARY];

    PRINT 'Table system_logs created successfully.';
END
GO

/* ============================================================
   7. user_login
   ============================================================ */

IF OBJECT_ID(N'dbo.user_login', N'U') IS NULL
BEGIN

    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    CREATE TABLE [dbo].[user_login]
    (
        [username]      [nvarchar](100) NOT NULL,
        [password]      [nvarchar](255) NOT NULL,
        [display_name]  [nvarchar](255) NOT NULL,
        [role]          [nvarchar](50) NOT NULL,

        CONSTRAINT [PK_user_login]
            PRIMARY KEY CLUSTERED ([username] ASC)
    )
    ON [PRIMARY];

    PRINT 'Table user_login created successfully.';
END
GO

/* ============================================================
   8. Verification
   ============================================================ */

SELECT
    DB_NAME() AS CurrentDatabase;
GO

SELECT
    TABLE_SCHEMA,
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO

/* ============================================================
   9. Verify Agent_TNLX Columns
   ============================================================ */

SELECT
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Agent_TNLX'
ORDER BY ORDINAL_POSITION;
GO

/* ============================================================
   10. Test Data
   ============================================================ */

SELECT *
FROM dbo.Agent_TNLX;
GO

SELECT *
FROM dbo.Agent_Disk;
GO