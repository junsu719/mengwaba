"""獨立資料產生腳本:農民曆工具 v1 神明生日頁用資料。

讀取 data/raw/deities/deity_birthdays.csv(三源一致主表,人工核實)與
data/processed/deities/deity_dates_2020_2040.csv(scripts/generate_deity_dates.py
純計算產生),依 2026-09-21 Jun 拍板的 slug/標題/別名對照表(見 DECISIONS.md),
合併輸出 site 端可直接消費的 data/normalized/deities/deities.json。

v1 範圍僅 24 尊三源一致神明,不含 unverified.csv 的候選(開臺聖王、臨水夫人留待
第二批,其餘 unverified 項目依 Jun 拍板全部不上架,見 DECISIONS.md)。

不改動 data/raw/deities/(人工核實基準資料)與 data/processed/deities/(純計算產出),
本腳本只做「合併 + 附加顯示中繼資料」,可重複執行、冪等。
"""

import csv
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
BIRTHDAYS_CSV = ROOT / "data/raw/deities/deity_birthdays.csv"
DATES_CSV = ROOT / "data/processed/deities/deity_dates_2020_2040.csv"
OUT_PATH = ROOT / "data/normalized/deities/deities.json"

# deity_name -> 顯示中繼資料(2026-09-21 Jun 逐項拍板,不得自行更動;新增神明須另外走
# 相同的 slug 提案 → Jun 確認流程,不可比照舊項目直接套規則生成)。
# slug: 網址 slug(漢語拼音、全小寫、連字號分隔)
# title: 頁面標題顯示名稱(含 Jun 指定的括號別名)
# body_alt_names: 內文要提及的別名(專指該尊、不會撞名/不會指到多尊)
# body_note: 需要額外說明的特殊情況(撞名警語、俗稱說明等),純文字,可為 None
DEITY_META = {
    "觀世音菩薩": dict(
        slug="guan-yin",
        title="觀音(觀世音菩薩)",
        body_alt_names=["觀世音"],
        body_note=None,
    ),
    "地藏王菩薩": dict(
        slug="di-zang-wang",
        title="地藏王菩薩",
        body_alt_names=["地藏菩薩", "地藏王"],
        body_note=None,
    ),
    "釋迦牟尼佛": dict(
        slug="shi-jia-mou-ni-fo",
        title="釋迦牟尼佛",
        body_alt_names=["佛祖"],
        body_note="「佛祖」在一般口語中常泛指佛教的「佛」,不一定專指釋迦牟尼佛本尊,本站頁面仍以全名為主。",
    ),
    "濟公": dict(slug="ji-gong", title="濟公", body_alt_names=[], body_note=None),
    "文昌帝君": dict(
        slug="wen-chang-di-jun",
        title="文昌帝君",
        body_alt_names=["文昌君"],
        body_note=None,
    ),
    "月下老人": dict(
        slug="yue-lao",
        title="月老(月下老人)",
        body_alt_names=[],
        body_note=None,
    ),
    "玉皇上帝": dict(
        slug="tian-gong",
        title="天公(玉皇大帝)",
        body_alt_names=["玉皇大帝", "玉皇上帝"],
        body_note="民間更常見的正式寫法是「玉皇大帝」,通稱「天公」,兩種寫法皆指同一神明。",
    ),
    "上元天官大帝": dict(
        slug="shang-yuan-tian-guan-da-di",
        title="上元天官大帝",
        body_alt_names=["天官大帝"],
        body_note="與中元地官大帝、下元水官大帝合稱三官大帝,簡稱「天官大帝」時請注意與另外兩位區分。",
    ),
    "下元水官大帝": dict(
        slug="xia-yuan-shui-guan-da-di",
        title="下元水官大帝",
        body_alt_names=["水官大帝"],
        body_note="與上元天官大帝、中元地官大帝合稱三官大帝,簡稱「水官大帝」時請注意與另外兩位區分。",
    ),
    "太上老君": dict(
        slug="tai-shang-lao-jun",
        title="太上老君",
        body_alt_names=["老子"],
        body_note="道教尊為太上老君的老子,是神格化後的稱呼;「老子」一詞在一般語境也常指道家思想家本人,兩者所指不完全相同。",
    ),
    "瑤池金母": dict(
        slug="wang-mu-niang-niang",
        title="王母娘娘(瑤池金母)",
        body_alt_names=["西王母"],
        body_note="瑤池金母、王母娘娘、西王母為同一神明的不同稱呼(慈惠堂系統稱瑤池金母、勝安宮系統稱王母娘娘,兩系統同奉一神,僅稱呼不同)。",
    ),
    "天上聖母": dict(
        slug="ma-zu",
        title="媽祖(天上聖母)",
        body_alt_names=[],
        body_note=None,
    ),
    "保生大帝": dict(
        slug="bao-sheng-da-di",
        title="保生大帝",
        body_alt_names=["大道公"],
        body_note=None,
    ),
    "開漳聖王": dict(
        slug="kai-zhang-sheng-wang",
        title="開漳聖王",
        body_alt_names=[],
        body_note="民間有時俗稱「聖王公」,但此俗稱也用於廣澤尊王等其他神明,容易混淆,本站不作為別名使用。",
    ),
    "清水祖師": dict(
        slug="qing-shui-zu-shi",
        title="清水祖師",
        body_alt_names=[],
        body_note="民間有時俗稱「祖師公」,但此俗稱也可能指其他祖師公信仰,並非清水祖師專屬稱呼,本站不作為別名使用。",
    ),
    "廣澤尊王": dict(
        slug="guang-ze-zun-wang",
        title="廣澤尊王",
        body_alt_names=[],
        body_note="民間有時俗稱「聖王公」,但此俗稱也用於開漳聖王等其他神明,容易混淆,本站不作為別名使用。",
    ),
    "福德正神": dict(
        slug="tu-di-gong",
        title="土地公(福德正神)",
        body_alt_names=[],
        body_note=None,
    ),
    "虎爺": dict(slug="hu-ye", title="虎爺", body_alt_names=[], body_note=None),
    "中壇元帥": dict(
        slug="san-tai-zi",
        title="三太子(哪吒)",
        body_alt_names=["哪吒", "中壇元帥"],
        body_note=None,
    ),
    "關聖帝君": dict(
        slug="guan-gong",
        title="關公(關聖帝君)",
        body_alt_names=["恩主公"],
        body_note=None,
    ),
    "玄天上帝": dict(
        slug="xuan-tian-shang-di",
        title="玄天上帝",
        body_alt_names=[],
        body_note="民間有時俗稱「上帝公」,但單獨提及「上帝」容易與其他宗教語境的「上帝」混淆,本站不作為別名使用。",
    ),
    "財神": dict(
        slug="zhao-gong-ming",
        title="趙公明",
        body_alt_names=["武財神"],
        body_note="趙公明俗稱「武財神」,農曆三月十五聖誕(見下方紀念日)。民間另有農曆正月初五「迎財神」的習俗,但依主祀廟查證,這是民俗習俗日,並非廟方認定的神明誕辰,與三月十五聖誕性質不同,不宜混為一談。",
    ),
    "九天玄女": dict(
        slug="jiu-tian-xuan-nv",
        title="九天玄女",
        body_alt_names=[],
        body_note=None,
    ),
    "註生娘娘": dict(
        slug="zhu-sheng-niang-niang",
        title="註生娘娘",
        body_alt_names=["註生媽"],
        body_note=None,
    ),
}

# 查證來源網域 -> 讀者看得懂的名稱(2026-09-21 補做,前一版直接顯示「來源1/2/3」被 Jun 打回)。
# 名稱一律取自該網域首頁或該篇文章的 <title> 標籤實際文字(用 curl 逐一撈取後人工濃縮),
# 不臆測、不自行命名,兩個 curl 抓不到標題的網域(taiwangods.moi.gov.tw、fgs.org.tw)改採
# data/raw/deities/README.md「四、這次第二輪實際使用的廟方官網」一節已查證過的名稱。
SOURCE_NAME_MAP = {
    "baodao.setn.com": "三立新聞網-寶島神很大",
    "books.masterhsingyun.org": "星雲大師全集",
    "jhulian.org.tw": "新竹竹蓮寺",
    "kidsmedia.com.tw": "KidsMedia",
    "luzhumazu.org.tw": "高雄路竹天后宮",
    "n.yam.com": "蕃新聞",
    "news.ltn.com.tw": "自由時報電子報",
    "nml.tw": "農民曆線上看",
    "religion.moi.gov.tw": "內政部宗教知識+",
    "shandegong.pixnet.net": "新莊善德宮",
    "taiwangods.moi.gov.tw": "全國宗教資訊網(內政部)",
    "tcmazu.org": "台中天后宮",
    "tcmb.culture.tw": "國家文化記憶庫",
    "temples.tw": "台灣好廟網",
    "tmach-culture.tainan.gov.tw": "臺南市宮廟博物館",
    "tw.news.yahoo.com": "Yahoo新聞",
    "udn.com": "聯合新聞網",
    "www.baoan.org.tw": "大龍峒保安宮",
    "www.buddhamind.com.tw": "佛祖心雜誌社",
    "www.cdns.com.tw": "中華日報",
    "www.citygod.org.tw": "松山霞海城隍廟",
    "www.ctwant.com": "CTWANT",
    "www.fgs.org.tw": "佛光山",
    "www.ftg.org.tw": "松山奉天宮",
    "www.fude.studio": "拜拜日曆",
    "www.gtg.org.tw": "台中廣天宮",
    "www.hccc.gov.tw": "花蓮縣文化局",
    "www.hsinkangmazu.org.tw": "新港奉天宮",
    "www.ht.org.tw": "行天宮",
    "www.hunglodei.tw": "烘爐地南山福德宮",
    "www.jendow.com.tw": "百科知識中文網",
    "www.kwwt.org.tw": "文武聖殿",
    "www.ld4m.org.tw": "桃園龍德宮",
    "www.longcheng.org.tw": "五甲龍成宮",
    "www.lungshan.org.tw": "艋舺龍山寺",
    "www.matsu.org.tw": "北港朝天宮",
    "www.nownews.com": "NOWnews今日新聞",
    "www.sanxia.ntpc.gov.tw": "新北市三峽區公所",
    "www.shiding.ntpc.gov.tw": "新北市石碇區公所",
    "www.taizih.org.tw": "新營太子宮",
    "www.tian.org.tw": "台灣首廟天壇",
    "www.twsanyuan.com": "台中太平三元宮",
    "www.yuanbao.org.tw": "臺中元保宮",
    "xiluo.org.tw": "台南西羅殿",
    "zh.wikipedia.org": "維基百科",
}


def source_name(url: str) -> str:
    netloc = urlparse(url).netloc
    name = SOURCE_NAME_MAP.get(netloc)
    if not name:
        raise SystemExit(f"SOURCE_NAME_MAP 缺少網域 {netloc}({url}) 的顯示名稱,中止。")
    return name


# 每個紀念日的讀者導向補充說明(2026-09-21 補做,取代直接顯示 CSV note 欄位——該欄位是
# 查證過程的內部筆記,含「第二輪」「協調者」「使用者裁示」等工程用語,不適合原樣端給讀者)。
# key 為 (deity_name, lunar_month, lunar_day, occasion_type),value 為 None(不顯示)或改寫過的
# 讀者向句子。新增神明/紀念日時預設不顯示,只有明確判斷有讀者價值的才在此加一筆。
OCCASION_NOTE_OVERRIDE: dict[tuple[str, str, str, str], str | None] = {
    ("觀世音菩薩", "2", "19", "佛辰"): "觀世音菩薩另有六月十九成道紀念日、九月十九出家紀念日,民間皆有人祭祀,本站分開列出三個日子。",
    ("濟公", "2", "2", "佛辰"): "主祀廟台中元保宮另記載五月十六涅槃紀念日,因性質與誕辰不同,本站未收錄。",
    ("月下老人", "8", "15", "千秋"): "與中秋節同一天。",
    ("玉皇上帝", "1", "9", "萬壽"): "俗稱「天公生」;主祀廟台南天壇引《臺灣通史》記載「歲以孟春九日為誕降之辰」。",
    ("上元天官大帝", "1", "15", "聖誕"): "與中元地官大帝、下元水官大帝合稱三官大帝,廟宇通常一併奉祀、一併記載聖誕日期。",
    ("下元水官大帝", "10", "15", "聖誕"): "與上元天官大帝、中元地官大帝合稱三官大帝,廟宇通常一併奉祀、一併記載聖誕日期。",
    ("廣澤尊王", "2", "22", "聖誕"): "民間另有一說認為二月廿二與八月廿二的意義互換(即二月廿二為成道、八月廿二才是誕辰),兩種說法並存,並非本站查證疏漏。",
    ("廣澤尊王", "8", "22", "成道"): "民間另有一說認為八月廿二與二月廿二的意義互換(即八月廿二為誕辰、二月廿二才是成道),兩種說法並存,並非本站查證疏漏。",
    ("福德正神", "2", "2", "聖誕"): "民間另有農曆八月十五得道升天之說,但可查證的來源不足,本站未單獨收錄。",
    ("中壇元帥", "9", "9", "聖誕"): "另有農曆五月十八成道之說,但可查證的來源不足,本站未單獨收錄。",
    ("關聖帝君", "6", "24", "聖誕"): "民間另有五月十三「磨刀節」之說,但非主流說法,與六月廿四聖誕是不同的兩件事,不宜混用。",
    ("關聖帝君", "1", "13", "飛昇"): "正月十三是關聖帝君飛昇紀念日,與六月廿四聖誕是不同的兩個日子;少數廟宇(如高雄鳳山赤山文衡殿)會把這天當成聖誕慶祝,屬少數特例。",
    ("註生娘娘", "3", "20", "聖誕"): "新竹竹蓮寺、台北松山奉天宮、高雄路竹天后宮皆有奉祀註生娘娘並記載此日期(註生娘娘在這三間廟皆為配祀神,非主祀神)。",
}


def load_birthdays():
    with open(BIRTHDAYS_CSV, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_dates():
    with open(DATES_CSV, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def occasion_key(row):
    return (row["deity_name"], row["lunar_month"], row["lunar_day"], row["occasion_type"])


def main():
    birthdays = load_birthdays()
    dates = load_dates()

    # 自我檢查:DEITY_META 必須恰好覆蓋主表全部 deity_name,一個不多一個不少
    csv_names = {r["deity_name"] for r in birthdays}
    meta_names = set(DEITY_META.keys())
    if csv_names != meta_names:
        missing = csv_names - meta_names
        extra = meta_names - csv_names
        raise SystemExit(
            f"DEITY_META 與 deity_birthdays.csv 神明清單不一致,中止。"
            f" 缺少中繼資料: {missing or '無'}; 多餘中繼資料: {extra or '無'}"
        )

    # slug 必須唯一
    slugs = [m["slug"] for m in DEITY_META.values()]
    if len(slugs) != len(set(slugs)):
        raise SystemExit("DEITY_META 出現重複 slug,中止。")

    # 自我檢查:OCCASION_NOTE_OVERRIDE 的 key 必須都能對到主表真實存在的紀念日,
    # 避免資料改版後留下對不到任何紀念日的死註記(不會被使用,也不會被發現)。
    real_keys = {(r["deity_name"], r["lunar_month"], r["lunar_day"], r["occasion_type"]) for r in birthdays}
    stale_override_keys = set(OCCASION_NOTE_OVERRIDE.keys()) - real_keys
    if stale_override_keys:
        raise SystemExit(f"OCCASION_NOTE_OVERRIDE 有對不到主表任何紀念日的 key,中止:{stale_override_keys}")

    dates_by_occasion = defaultdict(list)
    for row in dates:
        dates_by_occasion[occasion_key(row)].append(row)

    deities_by_name = defaultdict(list)
    for row in birthdays:
        deities_by_name[row["deity_name"]].append(row)

    output = []
    for deity_name, occasions in deities_by_name.items():
        meta = DEITY_META[deity_name]
        occ_list = []
        for occ in occasions:
            key = occasion_key(occ)
            occ_dates = dates_by_occasion.get(key, [])
            if not occ_dates:
                raise SystemExit(f"{deity_name} {occ['lunar_month']}/{occ['lunar_day']} 找不到對應的換算日期,中止。")
            occ_dates_sorted = sorted(occ_dates, key=lambda r: r["solar_date"])
            note_key = (deity_name, occ["lunar_month"], occ["lunar_day"], occ["occasion_type"])
            source_urls = [occ[k] for k in ("source_1", "source_2", "source_3") if occ.get(k)]
            occ_list.append(
                {
                    "lunar_month": int(occ["lunar_month"]),
                    "lunar_day": int(occ["lunar_day"]),
                    "lunar_label": occ_dates_sorted[0]["lunar_label"],
                    "occasion_type": occ["occasion_type"],
                    "honorific_source": occ["honorific_source"],
                    "sources": [{"url": u, "name": source_name(u)} for u in source_urls],
                    "note": OCCASION_NOTE_OVERRIDE.get(note_key),
                    "dates": [
                        {
                            "solar_year": int(d["solar_year"]),
                            "solar_date": d["solar_date"],
                            "weekday": d["weekday"],
                            "date_adjusted": d["date_adjusted"] == "true",
                            "adjust_note": d["adjust_note"] or None,
                        }
                        for d in occ_dates_sorted
                    ],
                }
            )
        # 同一尊神明的紀念日依農曆月日排序,固定順序、不依 CSV 原始順序(避免上游順序變動影響頁面呈現)
        occ_list.sort(key=lambda o: (o["lunar_month"], o["lunar_day"]))
        output.append(
            {
                "deity_name": deity_name,
                "common_name": occasions[0]["common_name"] or None,
                "slug": meta["slug"],
                "title": meta["title"],
                "body_alt_names": meta["body_alt_names"],
                "body_note": meta["body_note"],
                "occasions": occ_list,
            }
        )

    output.sort(key=lambda d: (d["occasions"][0]["lunar_month"], d["occasions"][0]["lunar_day"]))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
        f.write("\n")

    total_occasions = sum(len(d["occasions"]) for d in output)
    total_dates = sum(len(o["dates"]) for d in output for o in d["occasions"])
    print(f"寫入 {OUT_PATH}:{len(output)} 尊神明、{total_occasions} 個紀念日、{total_dates} 筆年度日期")


if __name__ == "__main__":
    main()
