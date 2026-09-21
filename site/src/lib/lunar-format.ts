// 農曆月份顯示慣例:一月/十二月在台灣民間習慣分別稱「正月」「臘月」,二月到十一月維持數字寫法
// (2026-09-21 Jun 拍板,全站一致套用:總覽頁神明清單、神明頁標題、換算工具皆呼叫本函式)。

/** 接受「一月」「十二月」這種完整月份字串,或「一月十五」這種「月份+日期」字串,只替換開頭的月份部分。 */
export function toFolkMonthLabel(label: string): string {
  if (label.startsWith('十二月')) return '臘月' + label.slice(3);
  if (label.startsWith('一月')) return '正月' + label.slice(2);
  return label;
}

/** 農曆生日換算工具的月份選單/錯誤訊息用:1 -> 正月、12 -> 臘月,其餘 -> 「N 月」。 */
export function folkMonthLabelFromNumber(month: number): string {
  if (month === 1) return '正月';
  if (month === 12) return '臘月';
  return `${month} 月`;
}
