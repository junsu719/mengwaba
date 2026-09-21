import { describe, expect, it } from 'vitest';
import { toFolkMonthLabel, folkMonthLabelFromNumber } from './lunar-format';

describe('toFolkMonthLabel', () => {
  it('一月轉正月、十二月轉臘月,其餘月份不變', () => {
    expect(toFolkMonthLabel('一月')).toBe('正月');
    expect(toFolkMonthLabel('十二月')).toBe('臘月');
    expect(toFolkMonthLabel('八月')).toBe('八月');
    expect(toFolkMonthLabel('十一月')).toBe('十一月'); // 確保「十一月」不會被「一月」的前綴誤判命中
  });

  it('接受「月份+日期」組合字串,只替換月份部分', () => {
    expect(toFolkMonthLabel('一月十五')).toBe('正月十五');
    expect(toFolkMonthLabel('十二月三十')).toBe('臘月三十');
    expect(toFolkMonthLabel('十一月初三')).toBe('十一月初三');
  });
});

describe('folkMonthLabelFromNumber', () => {
  it('1 轉正月、12 轉臘月,其餘回傳「N 月」', () => {
    expect(folkMonthLabelFromNumber(1)).toBe('正月');
    expect(folkMonthLabelFromNumber(12)).toBe('臘月');
    expect(folkMonthLabelFromNumber(3)).toBe('3 月');
  });
});
