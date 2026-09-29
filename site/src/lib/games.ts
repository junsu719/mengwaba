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
  {
    slug: 'darts',
    name: '酒吧飛鏢 3D',
    description: '模擬酒吧氣氛的 3D 飛鏢遊戲,抓準角度與力道一擲入靶,免安裝、免帳號直接玩。',
    status: 'live',
  },
  {
    slug: 'archery',
    name: '反曲弓射箭 3D',
    description: '3D 反曲弓射箭遊戲,拉弓瞄準考驗手感與耐心,免安裝、免帳號直接玩。',
    status: 'live',
  },
  {
    slug: 'beer-slide',
    name: '推酒杯 3D',
    description: '酒吧經典推杯遊戲搬上 3D,抓準力道讓酒杯精準停在目標區,免安裝、免帳號直接玩。',
    status: 'live',
  },
  {
    slug: 'beer-pong',
    name: '啤酒乒乓 3D',
    description: '3D 啤酒乒乓球遊戲,瞄準投球考驗手感,免安裝、免帳號直接玩。',
    status: 'live',
  },
];
