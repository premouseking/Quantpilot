import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

/**
 * Quantpilot 色板：和纸（背景）+ 墨色（正文）+ 朱色（强调）。
 * 参考日式研究笔记气质：暖白纸质、墨黑字重、一枚朱印作唯一强色。
 * 图表增益采用低饱和苔绿，使朱红专用于亏损、告警与主 CTA，层次更清晰。
 */
export const QPColors = {
  /** 纸色 / 大面积铺底与卡片 */
  paper: "#f3ecdc",
  paperSoft: "#f9f3e3",
  card: "#fdf9ee",
  surfaceMuted: "#efe7d2",
  hairline: "#dccfb2",
  hairlineSoft: "#e7dcc4",
  hairlineStrong: "#c4b48f",

  /** 墨色 / 正文与层次文字 */
  ink: "#1a1612",
  inkSoft: "#544a40",
  inkMuted: "#8a7f6f",
  inkOnDark: "#dcd1bb",

  /** 强调色：朱印系 */
  vermilion: "#bd3f29",
  vermilionSoft: "#d05f48",
  vermilionInk: "#8c2c1c",
  seal: "#a83524",
  indigo: "#2d3a5c", // 靛青：次要信息，如链接
  ochre: "#a87b1c", // 黄土：警示

  /** 损益：涨 / 跌 */
  gain: "#3f6b48",
  gainSoft: "#5b8a64",
  loss: "#bd3f29",
  lossSoft: "#d05f48",

  /** 侧边栏深色「墨色」面 */
  sumi: "#171310",
  sumiSurface: "#241d17",
  sumiHairline: "#3a3128",
  sumiText: "#dcd1bb",
  sumiTextDim: "#9b8f7c",
  sumiAccent: "#e07757",

  // ---- 历史别名：保留旧 import 路径兼容 ----
  brandPrimary: "#bd3f29",
  brandPrimaryHover: "#d05f48",
  accent: "#bd3f29",
  bg: "#f3ecdc",
  contentBg: "#fdf9ee",
  surface: "#f9f3e3",
  border: "#dccfb2",
  textPrimary: "#1a1612",
  textSecondary: "#544a40",
  textMuted: "#8a7f6f",
  success: "#3f6b48",
  danger: "#bd3f29",
  warning: "#a87b1c",
  sidebarBg: "#171310",
  sidebarSurface: "#241d17",
  sidebarText: "#dcd1bb",
  sidebarTextActive: "#e07757",
};

/**
 * ECharts 序列色：权益为浓墨；基准为虚线浅墨；其余沿用涨跌配对。
 */
export const QPSeries = {
  equity: "#1a1612",
  benchmark: "#8a7f6f",
  gain: "#3f6b48",
  loss: "#bd3f29",
  candleUp: "#3f6b48",
  candleDown: "#bd3f29",
  candleUpBorder: "#2f5236",
  candleDownBorder: "#8c2c1c",
  volume: "rgba(120, 96, 64, 0.5)",
  axis: "#544a40",
  grid: "rgba(26, 22, 18, 0.08)",
};

export const antdThemeConfig: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: QPColors.vermilion,
    colorInfo: QPColors.indigo,
    colorSuccess: QPColors.gain,
    colorError: QPColors.loss,
    colorWarning: QPColors.ochre,
    colorTextBase: QPColors.ink,
    colorBgBase: QPColors.card,
    colorBgLayout: QPColors.paper,
    colorBorder: QPColors.hairline,
    colorBorderSecondary: QPColors.hairlineSoft,
    colorLink: QPColors.vermilionInk,
    colorLinkHover: QPColors.vermilion,
    borderRadius: 4,
    borderRadiusLG: 6,
    borderRadiusSM: 3,
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Roboto, sans-serif',
  },
  components: {
    Layout: {
      bodyBg: QPColors.paper,
      headerBg: QPColors.paper,
      siderBg: QPColors.sumi,
    },
    Menu: {
      darkItemBg: QPColors.sumi,
      darkSubMenuItemBg: QPColors.sumi,
      darkItemSelectedBg: QPColors.sumiSurface,
      darkItemSelectedColor: QPColors.sumiAccent,
      darkItemColor: QPColors.sumiText,
      darkItemHoverColor: "#ffffff",
      itemBorderRadius: 3,
    },
    Card: {
      borderRadiusLG: 6,
      paddingLG: 20,
      colorBgContainer: QPColors.card,
      colorBorderSecondary: QPColors.hairline,
    },
    Statistic: {
      titleFontSize: 12,
      contentFontSize: 24,
    },
    Table: {
      headerBg: QPColors.paperSoft,
      headerColor: QPColors.inkSoft,
      borderColor: QPColors.hairline,
      rowHoverBg: QPColors.surfaceMuted,
    },
    Tabs: {
      titleFontSize: 14,
      horizontalItemPadding: "8px 12px",
      itemColor: QPColors.inkSoft,
      itemSelectedColor: QPColors.ink,
      inkBarColor: QPColors.vermilion,
    },
    Button: {
      controlHeight: 34,
      primaryShadow: "none",
      defaultShadow: "none",
    },
    Tag: {
      defaultBg: QPColors.surfaceMuted,
      defaultColor: QPColors.inkSoft,
    },
    Input: {
      colorBgContainer: QPColors.card,
    },
    Select: {
      colorBgContainer: QPColors.card,
    },
    DatePicker: {
      colorBgContainer: QPColors.card,
    },
    InputNumber: {
      colorBgContainer: QPColors.card,
    },
    Divider: {
      colorSplit: QPColors.hairline,
    },
    Alert: {
      colorInfoBg: QPColors.paperSoft,
      colorInfoBorder: QPColors.hairline,
    },
  },
};
