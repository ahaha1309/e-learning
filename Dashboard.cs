using System;
using System.Collections.Generic;

namespace TraceAbility.Models.ESD_Dashboard
{
    // ═══════════════════════════════════════════════
    // FILTER MODEL — chung cho mọi API call
    // FILTER MODEL — chung cho mọi API call
    // ═══════════════════════════════════════════════
    public class DashboardFilter
    {
        public string From { get; set; }          // yyyy-MM-dd
        public string To { get; set; }            // yyyy-MM-dd
        public string TemplateCode { get; set; }      // null = all 13 templates
        public string LockMethodCode { get; set; }
        public string LineId { get; set; }
    }

    // ═══════════════════════════════════════════════
    // KPI SUMMARY — 5 cards
    // ═══════════════════════════════════════════════
    public class DashboardSummary
    {
        public int TotalChecks { get; set; }
        public int OkCount { get; set; }
        public int NgCount { get; set; }
        public double PassRate { get; set; }       // 0–100
        public int PendingReview { get; set; }

        // So sánh kỳ trước (% change) — dương = tăng, âm = giảm
        public double? TotalChecksChange { get; set; }   // %
        public double? NgChange { get; set; }            // %
        public double? PassRateChange { get; set; }      // chênh lệch điểm (pp)

        // Kỳ trước (để FE tự tính nếu cần)
        public int? PrevTotalChecks { get; set; }
        public int? PrevNgCount { get; set; }
        public double? PrevPassRate { get; set; }
    }

    // ═══════════════════════════════════════════════
    // OK/NG TREND — line chart (theo ngày)
    // ═══════════════════════════════════════════════
    public class TrendPoint
    {
        public string Date { get; set; }           // "2026-07-25"
        public int Ok { get; set; }
        public int Ng { get; set; }
    }

    // ═══════════════════════════════════════════════
    // NG BY SHEET / LOCK METHOD — bar chart
    // Lấy hết 13 template
    // ═══════════════════════════════════════════════
    public class NGBySheetItem
    {
        public string TemplateCode { get; set; }
        public string TemplateName { get; set; }
        public string LockMethodCode { get; set; }
        public int NgCount { get; set; }
    }

    // ═══════════════════════════════════════════════
    // RESULT SUMMARY BY PERIOD — bảng tổng hợp
    // Mỗi template 1 row: Today / ThisWeek / ThisMonth / ThisYear
    // ═══════════════════════════════════════════════
    public class ResultByPeriodItem
    {
        public string TemplateCode { get; set; }
        public string TemplateName { get; set; }
        public string LockMethodCode { get; set; }

        // Today
        public int TodayOk { get; set; }
        public int TodayNg { get; set; }
        public int TodayTotal { get; set; }

        // This Week
        public int WeekOk { get; set; }
        public int WeekNg { get; set; }
        public int WeekTotal { get; set; }

        // This Month
        public int MonthOk { get; set; }
        public int MonthNg { get; set; }
        public int MonthTotal { get; set; }

        // This Year
        public int YearOk { get; set; }
        public int YearNg { get; set; }
        public int YearTotal { get; set; }

        // Danh sách các biến thể (VariantType/VariantValue) con của template này,
        // mỗi biến thể ứng với 1 PKID riêng trong MstESD_Template
        public List<ResultByPeriodChild> Children { get; set; } = new List<ResultByPeriodChild>();
    }

    // ═══════════════════════════════════════════════
    // RESULT SUMMARY BY PERIOD — CHILD (từng biến thể / PKID)
    // ═══════════════════════════════════════════════
    public class ResultByPeriodChild
    {
        public int TemplateID { get; set; }        // PKID trong MstESD_Template
        public string VariantType { get; set; }     // vd: "Frequency"
        public string VariantValue { get; set; }     // vd: "Daily" / "Weekly" / "Monthly"

        // Today
        public int TodayOk { get; set; }
        public int TodayNg { get; set; }
        public int TodayTotal { get; set; }

        // This Week
        public int WeekOk { get; set; }
        public int WeekNg { get; set; }
        public int WeekTotal { get; set; }

        // This Month
        public int MonthOk { get; set; }
        public int MonthNg { get; set; }
        public int MonthTotal { get; set; }

        // This Year
        public int YearOk { get; set; }
        public int YearNg { get; set; }
        public int YearTotal { get; set; }
    }

    // ═══════════════════════════════════════════════
    // RECENT NG — bảng NG mới nhất
    // ═══════════════════════════════════════════════
    public class RecentNGItem
    {
        public int PKID { get; set; }
        public string Time { get; set; }           // "HH:mm"
        public string LineID { get; set; }
        public string TemplateName { get; set; }
        public string LockMethodCode { get; set; }
        public string Remark { get; set; }
        public string OperatorName { get; set; }
        public string MachineID { get; set; }
    }

    // ═══════════════════════════════════════════════
    // RETURN OBJECT
    // ═══════════════════════════════════════════════
    public class ReturnDashboard
    {
        public string Code { get; set; }    // "00" = ok, "99" = error
        public string Message { get; set; }
        public object Data { get; set; }
    }
}
