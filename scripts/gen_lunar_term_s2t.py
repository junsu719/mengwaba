"""獨立資料產生腳本:產生 site/src/lib/lunar-term-s2t.ts。

`lunar-javascript`(前端用,client-side 即時算今日農曆/宜忌/沖煞)與其 Python 對應版本
`lunar_python`(pipeline 用,已於 scripts/generate_lunar_data.py 驗證通過)回傳的宜忌、
吉神、凶煞、生肖、節氣詞彙一律為簡體,前端頁面需要繁體(本站 zh-Hant),故產生一份
「簡體詞彙 -> 繁體詞彙」的固定對照表,供 site/src/lib/lunar-client.ts 查表轉換。

刻意不用逐字元轉換(泛用簡繁字元轉換器在部分字元有多重繁體對應時可能选错,例如
「后」可能是「後」或「皇后」的「后」,視語境而定),改用 `zhconv`(整理自維基百科簡繁
轉換表)對函式庫實際會用到的每一個「完整詞彙」(而非單字)做轉換,再人工抽樣核對過
是否符合已知的宜忌繁體慣用寫法(比對來源見 DECISIONS.md 2026-09-21 條目:抽 25 天與
nml.tw 逐欄位比對時得到的繁體對照)。這份表只保證涵蓋 lunar_python/lunar-javascript
內建詞彙表會出現的固定詞彙,不是通用簡繁轉換器,不可挪用於本表以外的文字轉換。

輸出後屬靜態資料,不需重算;可重複執行(冪等)。若未來函式庫版本更新、詞彙表擴充,
重跑本腳本即可補齊新詞(舊詞的轉換結果不會因重跑而改變)。
"""

import json
from pathlib import Path

import zhconv
from lunar_python.util.LunarUtil import LunarUtil

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "site/src/lib/lunar-term-s2t.ts"

ZODIAC_SIMPLIFIED = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"]
JIEQI_SIMPLIFIED = [
    "冬至", "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种",
    "夏至", "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪",
]


def main():
    yi_ji = LunarUtil.__dict__["_LunarUtil__YI_JI"]
    shen_sha = LunarUtil.__dict__["_LunarUtil__SHEN_SHA"]

    all_terms = list(dict.fromkeys([*yi_ji, *shen_sha, *ZODIAC_SIMPLIFIED, *JIEQI_SIMPLIFIED]))
    merged = {t: zhconv.convert(t, "zh-tw") for t in all_terms}
    changed = {k: v for k, v in merged.items() if k != v}

    lines = [
        "// 自動產生,請勿手動編輯。重新產生:`python3 scripts/gen_lunar_term_s2t.py`(見該檔開頭說明)。",
        f"// 涵蓋 lunar-javascript 內建的簡體宜忌/吉神凶煞/生肖/節氣詞彙(共 {len(all_terms)} 詞,"
        f"其中 {len(changed)} 詞簡繁不同),並非泛用簡繁字元轉換器。詳見 DECISIONS.md 2026-09-21 條目。",
        "export const LUNAR_TERM_S2T: Record<string, string> = {",
    ]
    for k in sorted(changed):
        lines.append(f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(changed[k], ensure_ascii=False)},")
    lines.append("};")
    lines.append("")
    lines.append(
        "/** 將 lunar-javascript 回傳的簡體宜忌/吉神凶煞/生肖/節氣詞彙轉為繁體;查無對照就照原字輸出,"
        "不拋錯不留白(函式庫詞彙表若未來擴充,新詞在補跑本腳本前會以簡體原文顯示,不影響頁面可用性)。 */"
    )
    lines.append("export function toTraditional(term: string): string {")
    lines.append("  return LUNAR_TERM_S2T[term] ?? term;")
    lines.append("}")
    lines.append("")

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"寫入 {OUT_PATH}:{len(all_terms)} 詞,{len(changed)} 詞簡繁不同")


if __name__ == "__main__":
    main()
