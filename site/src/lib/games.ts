export interface Game {
  slug: string;
  name: string;
  description: string;
  status: 'live' | 'planned';
}

// 遊戲專區註冊表:新增遊戲只需在這裡加一筆,/games/ 列表頁自動列出。
// 每款遊戲皆為自包含靜態 HTML(見 public/games/{slug}/index.html),不使用 D1、不走
// 垃圾車/行事曆/農民曆的資料流程,build/deploy 也不受那些流程影響。
export const GAMES: Game[] = [
  {
    slug: 'nineball',
    name: '九號球 3D',
    description: '瀏覽器內建的 3D 九號球撞球遊戲,支援觸控與滑鼠操作,免安裝、免帳號直接玩。',
    status: 'live',
  },
];
