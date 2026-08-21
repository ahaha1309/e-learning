using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data;
using System.Data.SqlClient;
using TraceAbility.Common;

namespace TraceAbility.Models.ESD_Dashboard
{
    public class DashboardDB
    {
        // ═══════════════════════════════════════════════
        // HELPER — build WHERE + params
        // ═══════════════════════════════════════════════
        private void AddFilterParams(SqlCommand cmd, DashboardFilter f)
        {
            if (!string.IsNullOrEmpty(f.From))
                cmd.Parameters.Add("@from", SqlDbType.Date).Value = DateTime.Parse(f.From);
            if (!string.IsNullOrEmpty(f.To))
                cmd.Parameters.Add("@to", SqlDbType.Date).Value = DateTime.Parse(f.To);
            if (!string.IsNullOrEmpty(f.TemplateCode))
                cmd.Parameters.Add("@templateCode", SqlDbType.NVarChar).Value = f.TemplateCode;
            if (!string.IsNullOrEmpty(f.LockMethodCode))
                cmd.Parameters.Add("@lockMethod", SqlDbType.NVarChar).Value = f.LockMethodCode;
            if (!string.IsNullOrEmpty(f.LineId))
                cmd.Parameters.Add("@lineId", SqlDbType.NVarChar).Value = f.LineId;
        }

        private string BuildWhere(DashboardFilter f, string sub = "s",string tem="t")
        {
            var c = new List<string>();
            if (!string.IsNullOrEmpty(f.From))
                c.Add($"{sub}.CheckDate >= @from");
            if (!string.IsNullOrEmpty(f.To))
                c.Add($"{sub}.CheckDate < DATEADD(DAY, 1, @to)");
            if (!string.IsNullOrEmpty(f.TemplateCode))
                c.Add($"{tem}.TemplateCode = @templateCode");
            if (!string.IsNullOrEmpty(f.LockMethodCode))
                c.Add($"{sub}.LockMethodCode = @lockMethod");
            if (!string.IsNullOrEmpty(f.LineId))
                c.Add($"{sub}.LineID = @lineId");
            return c.Count > 0 ? " AND " + string.Join(" AND ", c) : "";
        }

        // ═══════════════════════════════════════════════
        // HELPER — query summary cho 1 kỳ
        // TotalChecks = chỉ đếm records có Remark OK hoặc NG
        // ═══════════════════════════════════════════════
        private DashboardSummary QuerySummary(SqlConnection conn, DashboardFilter f)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    SELECT
                        SUM(CASE WHEN UPPER(LTRIM(RTRIM(s.Remark))) IN ('OK','NG') THEN 1 ELSE 0 END) AS TotalChecks,
                        SUM(CASE WHEN UPPER(LTRIM(RTRIM(s.Remark))) = 'OK' THEN 1 ELSE 0 END) AS OkCount,
                        SUM(CASE WHEN UPPER(LTRIM(RTRIM(s.Remark))) = 'NG' THEN 1 ELSE 0 END) AS NgCount,
                        SUM(CASE WHEN s.Status = 'Submitted' THEN 1 ELSE 0 END) AS PendingReview
                    FROM [dbo].[TblESD_Submission] s
                    INNER JOIN [dbo].[MstESD_Template] t ON t.PKID = s.TemplateID
                    WHERE 1=1 " + BuildWhere(f);
                AddFilterParams(cmd, f);

                using (var rdr = cmd.ExecuteReader())
                {
                    if (rdr.Read())
                    {
                        int total = rdr.GetInt32(0);
                        int ok = rdr.GetInt32(1);
                        int ng = rdr.GetInt32(2);
                        return new DashboardSummary
                        {
                            TotalChecks = total,
                            OkCount = ok,
                            NgCount = ng,
                            PassRate = (ok + ng) > 0 ? Math.Round((double)ok / (ok + ng) * 100, 1) : 0,
                            PendingReview = rdr.GetInt32(3)
                        };
                    }
                }
            }
            return new DashboardSummary();
        }

        // ═══════════════════════════════════════════════
        // HELPER — tính kỳ trước (cùng độ dài, lùi lại)
        // ═══════════════════════════════════════════════
        private DashboardFilter BuildPreviousFilter(DashboardFilter cur)
        {
            var prev = new DashboardFilter
            {
                TemplateCode = cur.TemplateCode           ,
                LockMethodCode = cur.LockMethodCode,
                LineId = cur.LineId
            };
            DateTime from, to;
            if (!string.IsNullOrEmpty(cur.From) && !string.IsNullOrEmpty(cur.To))
            {
                from = DateTime.Parse(cur.From);
                to = DateTime.Parse(cur.To);
            }
            else
            {
                to = DateTime.Today;
                from = to.AddDays(-7);
            }
            int days = Math.Max((to - from).Days, 1);
            prev.From = from.AddDays(-days).ToString("yyyy-MM-dd");
            prev.To = from.AddDays(-1).ToString("yyyy-MM-dd");
            return prev;
        }

        private double? CalcPctChange(int cur, int prev)
        {
            if (prev == 0) return cur > 0 ? 100.0 : (double?)null;
            return Math.Round((double)(cur - prev) / prev * 100, 1);
        }

        // ═══════════════════════════════════════════════
        // 1. SUMMARY — 5 KPI cards + so sánh kỳ trước
        // ═══════════════════════════════════════════════
        public ReturnDashboard GetSummary(DashboardFilter f)
        {
            try
            {
                using (SqlConnection conn = ConnectSQLCommon.CreateAndOpenSqlConnection())
                {
                    var cur = QuerySummary(conn, f);
                    var prev = QuerySummary(conn, BuildPreviousFilter(f));

                    cur.TotalChecksChange = CalcPctChange(cur.TotalChecks, prev.TotalChecks);
                    cur.NgChange = CalcPctChange(cur.NgCount, prev.NgCount);
                    cur.PassRateChange = (prev.OkCount + prev.NgCount) > 0
                        ? Math.Round(cur.PassRate - prev.PassRate, 1)
                        : (double?)null;
                    cur.PrevTotalChecks = prev.TotalChecks;
                    cur.PrevNgCount = prev.NgCount;
                    cur.PrevPassRate = prev.PassRate;

                    return new ReturnDashboard { Code = "00", Data = cur };
                }
            }
            catch (Exception ex)
            {
                return new ReturnDashboard { Code = "99", Message = ex.Message };
            }
        }


        private string BuildTemplateWhere(DashboardFilter f, string alias = "s")
        {
            if (!string.IsNullOrEmpty(f.TemplateCode))
                return $" AND {alias}.TemplateID = @templateId";
            return "";
        }

        private void AddTemplateParam(SqlCommand cmd, DashboardFilter f)
        {
            if (!string.IsNullOrEmpty(f.TemplateCode))
                cmd.Parameters.Add("@templateId", SqlDbType.NVarChar).Value = f.TemplateCode;
        }

        // ═══════════════════════════════════════════════
        // 4. RESULT BY PERIOD
        // Period calculations dùng To date làm mốc (Today/Week/Month/Year)
        // ALL 5 filters áp dụng cho submission data
        // ═══════════════════════════════════════════════
        public ReturnDashboard GetResultByPeriod(DashboardFilter f)
        {
            try
            {
                DateTime refDate = DateTime.Today;
                if (!string.IsNullOrEmpty(f.To))
                    refDate = DateTime.Parse(f.To);
                else if (!string.IsNullOrEmpty(f.From))
                    refDate = DateTime.Parse(f.From);

                DateTime weekStart = refDate.AddDays(1 - (int)refDate.DayOfWeek);
                DateTime monthStart = new DateTime(refDate.Year, refDate.Month, 1);
                DateTime yearStart = new DateTime(refDate.Year, 1, 1);

                string joinWhere = BuildWhere(f);

                using (SqlConnection conn = ConnectSQLCommon.CreateAndOpenSqlConnection())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Parameters.Add("@refDate", SqlDbType.Date).Value = refDate;
                    cmd.Parameters.Add("@weekStart", SqlDbType.Date).Value = weekStart;
                    cmd.Parameters.Add("@monthStart", SqlDbType.Date).Value = monthStart;
                    cmd.Parameters.Add("@yearStart", SqlDbType.Date).Value = yearStart;
                    AddFilterParams(cmd, f);

                    cmd.CommandText = @"
                        SELECT
                            t.PKID, t.TemplateCode, t.TemplateName, ISNULL(t.LockMethodCode,''), t.SortOrder,
                            ISNULL(t.VariantType,''), ISNULL(t.VariantValue,''),

                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)=@refDate AND UPPER(LTRIM(RTRIM(s.Remark)))='OK' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)=@refDate AND UPPER(LTRIM(RTRIM(s.Remark)))='NG' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)=@refDate AND UPPER(LTRIM(RTRIM(s.Remark))) IN ('OK','NG') THEN 1 ELSE 0 END),

                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@weekStart AND UPPER(LTRIM(RTRIM(s.Remark)))='OK' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@weekStart AND UPPER(LTRIM(RTRIM(s.Remark)))='NG' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@weekStart AND UPPER(LTRIM(RTRIM(s.Remark))) IN ('OK','NG') THEN 1 ELSE 0 END),

                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@monthStart AND UPPER(LTRIM(RTRIM(s.Remark)))='OK' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@monthStart AND UPPER(LTRIM(RTRIM(s.Remark)))='NG' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@monthStart AND UPPER(LTRIM(RTRIM(s.Remark))) IN ('OK','NG') THEN 1 ELSE 0 END),

                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@yearStart AND UPPER(LTRIM(RTRIM(s.Remark)))='OK' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@yearStart AND UPPER(LTRIM(RTRIM(s.Remark)))='NG' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN CAST(s.CheckDate AS DATE)>=@yearStart AND UPPER(LTRIM(RTRIM(s.Remark))) IN ('OK','NG') THEN 1 ELSE 0 END)

                        FROM [dbo].[MstESD_Template] t
                        LEFT JOIN [dbo].[TblESD_Submission] s
                            ON s.TemplateID=t.PKID " + joinWhere + @"
                        WHERE t.IsActive=1
                        GROUP BY t.PKID, t.TemplateCode, t.TemplateName, t.LockMethodCode, t.SortOrder, t.VariantType, t.VariantValue
                        ORDER BY t.SortOrder, t.TemplateName, t.VariantValue";

                    // Gom theo TemplateCode: mỗi TemplateCode là 1 hàng cha (tổng),
                    // mỗi PKID/VariantValue bên trong là 1 hàng con.
                    var map = new Dictionary<string, ResultByPeriodItem>();
                    var order = new List<string>();

                    using (var rdr = cmd.ExecuteReader())
                    {
                        while (rdr.Read())
                        {
                            int pkid = rdr.GetInt32(0);
                            string code = rdr.GetString(1);
                            string name = rdr.GetString(2);
                            string lockMethod = rdr.GetString(3);
                            string variantType = rdr.GetString(5);
                            string variantValue = rdr.GetString(6);

                            int todayOk = rdr.GetInt32(7), todayNg = rdr.GetInt32(8), todayTotal = rdr.GetInt32(9);
                            int weekOk = rdr.GetInt32(10), weekNg = rdr.GetInt32(11), weekTotal = rdr.GetInt32(12);
                            int monthOk = rdr.GetInt32(13), monthNg = rdr.GetInt32(14), monthTotal = rdr.GetInt32(15);
                            int yearOk = rdr.GetInt32(16), yearNg = rdr.GetInt32(17), yearTotal = rdr.GetInt32(18);

                            ResultByPeriodItem parent;
                            if (!map.TryGetValue(code, out parent))
                            {
                                parent = new ResultByPeriodItem
                                {
                                    TemplateCode = code,
                                    TemplateName = name,
                                    LockMethodCode = lockMethod
                                };
                                map[code] = parent;
                                order.Add(code);
                            }

                            // Cộng dồn số liệu con vào tổng của cha
                            parent.TodayOk += todayOk; parent.TodayNg += todayNg; parent.TodayTotal += todayTotal;
                            parent.WeekOk += weekOk; parent.WeekNg += weekNg; parent.WeekTotal += weekTotal;
                            parent.MonthOk += monthOk; parent.MonthNg += monthNg; parent.MonthTotal += monthTotal;
                            parent.YearOk += yearOk; parent.YearNg += yearNg; parent.YearTotal += yearTotal;

                            parent.Children.Add(new ResultByPeriodChild
                            {
                                TemplateID = pkid,
                                VariantType = variantType,
                                VariantValue = variantValue,
                                TodayOk = todayOk,
                                TodayNg = todayNg,
                                TodayTotal = todayTotal,
                                WeekOk = weekOk,
                                WeekNg = weekNg,
                                WeekTotal = weekTotal,
                                MonthOk = monthOk,
                                MonthNg = monthNg,
                                MonthTotal = monthTotal,
                                YearOk = yearOk,
                                YearNg = yearNg,
                                YearTotal = yearTotal
                            });
                        }
                    }

                    var list = new List<ResultByPeriodItem>();
                    foreach (var code in order) list.Add(map[code]);

                    return new ReturnDashboard { Code = "00", Data = list };
                }
            }
            catch (Exception ex) { return new ReturnDashboard { Code = "99", Message = ex.Message }; }
        }

        // ═══════════════════════════════════════════════
        // 5. RECENT NG
        // ═══════════════════════════════════════════════
        public ReturnDashboard GetRecentNG(DashboardFilter f, int limit = 10)
        {
            try
            {
                using (SqlConnection conn = ConnectSQLCommon.CreateAndOpenSqlConnection())
                using (var cmd = conn.CreateCommand())
                {
   
                    cmd.Parameters.Add("@limit", SqlDbType.Int).Value = limit;
                    cmd.CommandText = @"
                        SELECT TOP (@limit)
                            s.PKID,
                            CONVERT(VARCHAR(5), s.SubmittedAt, 120),
                            ISNULL(s.LineID,''), ISNULL(t.TemplateName,''),
                            ISNULL(s.LockMethodCode,''), ISNULL(s.Remark,''),
                            ISNULL(s.OperatorName,''), ISNULL(s.MachineID,'')
                        FROM [dbo].[TblESD_Submission] s
                        INNER JOIN [dbo].[MstESD_Template] t ON t.PKID=s.TemplateID
                        WHERE UPPER(LTRIM(RTRIM(s.Remark)))='NG' " + BuildWhere(f) + @"
                        ORDER BY s.SubmittedAt DESC, s.CreatedAt DESC";
                    AddFilterParams(cmd, f);

                    var list = new List<RecentNGItem>();
                    using (var rdr = cmd.ExecuteReader())
                        while (rdr.Read())
                            list.Add(new RecentNGItem
                            {
                                PKID = rdr.GetInt32(0),
                                Time = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                                LineID = rdr.GetString(2),
                                TemplateName = rdr.GetString(3),
                                LockMethodCode = rdr.GetString(4),
                                Remark = rdr.GetString(5),
                                OperatorName = rdr.GetString(6),
                                MachineID = rdr.GetString(7)
                            });
                    return new ReturnDashboard { Code = "00", Data = list };
                }
            }
            catch (Exception ex) { return new ReturnDashboard { Code = "99", Message = ex.Message }; }
        }

        // ═══════════════════════════════════════════════
        // 6. DROPDOWNS
        // ═══════════════════════════════════════════════
        public ReturnDashboard GetTemplates()
        {
            try
            {
                using (SqlConnection conn = ConnectSQLCommon.CreateAndOpenSqlConnection())
                using (var cmd = conn.CreateCommand())
                {
          
                    cmd.CommandText = @"SELECT distinct TemplateCode, TemplateName, ISNULL(LockMethodCode,''),SortOrder
                        FROM [dbo].[MstESD_Template] WHERE IsActive=1 ORDER BY SortOrder, TemplateName";
                    var list = new List<object>();
                    using (var rdr = cmd.ExecuteReader())
                        while (rdr.Read())
                            list.Add(new { code = rdr.GetString(0), name = rdr.GetString(1), lockMethod = rdr.GetString(2) });
                    return new ReturnDashboard { Code = "00", Data = list };
                }
            }
            catch (Exception ex) { return new ReturnDashboard { Code = "99", Message = ex.Message }; }
        }

        public ReturnDashboard GetLockMethods()
        {
            try
            {
                using (SqlConnection conn = ConnectSQLCommon.CreateAndOpenSqlConnection())
                using (var cmd = conn.CreateCommand())
                {
         
                    cmd.CommandText = @"SELECT DISTINCT LockMethodCode FROM [dbo].[MstESD_Template]
                        WHERE IsActive=1 AND LockMethodCode IS NOT NULL ORDER BY LockMethodCode";
                    var list = new List<string>();
                    using (var rdr = cmd.ExecuteReader())
                        while (rdr.Read()) list.Add(rdr.GetString(0));
                    return new ReturnDashboard { Code = "00", Data = list };
                }
            }
            catch (Exception ex) { return new ReturnDashboard { Code = "99", Message = ex.Message }; }
        }

        public ReturnDashboard GetLines()
        {
            try
            {
                using (SqlConnection conn = ConnectSQLCommon.CreateAndOpenSqlConnection())
                using (var cmd = conn.CreateCommand())
                {
        
                    cmd.CommandText = @"SELECT DISTINCT LineID FROM [dbo].[TblESD_Submission]
                        WHERE LineID IS NOT NULL AND LTRIM(RTRIM(LineID))<>'' ORDER BY LineID";
                    var list = new List<string>();
                    using (var rdr = cmd.ExecuteReader())
                        while (rdr.Read()) list.Add(rdr.GetString(0));
                    return new ReturnDashboard { Code = "00", Data = list };
                }
            }
            catch (Exception ex) { return new ReturnDashboard { Code = "99", Message = ex.Message }; }
        }
    }
}
