// North is negative Z. This order is also the fixed north-up guide layout.
//
// `signs` is the roster anchorSign() draws on the two anchor buildings of each sector
// (`signs[0]` is the canonical sector name, the rest are variants so two anchors in the same
// sector no longer read as a photocopy). `shops` is the roster every other sign on the sector
// draws from, picked by the building's ordinal *within its own sector* so a 12-lot sector shows
// 12 different words instead of cycling through 4.
export const DISTRICT_STYLES = [
  { id: 'northwest', name: '港湾商贸', sign: '港灣商社', english: 'HARBOUR EXCHANGE', cx: -42, cz: -48, primary: '#39baff', secondary: '#ffb25d', paint: '#354957', minHeight: 8, maxHeight: 22, buildingStyle: 'harbour', subtitle: '仓储 · 商贸 · 夜航',
    signs: ['港灣商社', '港口貨棧', '船務大樓', '燈塔管理局'],
    shops: ['港灣商社', '港灣倉庫', '夜航貨運', '海員俱樂部', '貨櫃調度', '冷鏈倉儲', '報關行', '船錨鐵廠', '燈塔值守', '海產批發', '引水站', '港務食堂', '錨鏈修理', '潮汐氣象站'] },
  { id: 'north', name: '夜航商务', sign: '夜航商社', english: 'MIDNIGHT BUSINESS', cx: 0, cz: -48, primary: '#47e0f1', secondary: '#d5f3ff', paint: '#294350', minHeight: 20, maxHeight: 34, buildingStyle: 'business', subtitle: '玻璃塔 · 金融 · 商务',
    signs: ['夜航商社', '環球金融', '未來科技', '雲端數據'],
    shops: ['夜航商社', '環球金融', '未來科技', '雲端數據', '期貨交易所', '跨境結算', '法務事務所', '夜班會計', '風險管理', '併購顧問', '外匯櫃檯', '加密託管', '商業仲裁', '雲端機房'] },
  { id: 'northeast', name: '云端会馆', sign: '雲端會館', english: 'CLOUDLINE LOUNGE', cx: 42, cz: -48, primary: '#c0efff', secondary: '#ffc878', paint: '#3f4b55', minHeight: 8, maxHeight: 14, buildingStyle: 'lounge', subtitle: '双塔 · 会馆 · 空中连廊', preset: 'skyline',
    signs: ['雲端會館', '雲頂觀景台', '空中連廊', '雙塔會所'],
    shops: ['雲端會館', '星空酒廊', '夜景會所', '九龍禮賓', '雲頂觀景台', '香檳吧', '雪茄室', '私廚晚宴', '天台泳池', '雪茄廊', '禮車服務', '雲海茶座', '尊榮套房', '夜間管家'] },
  { id: 'west', name: '机电工坊', sign: '機電工坊', english: 'MACHINE QUARTER', cx: -42, cz: 0, primary: '#69e6b3', secondary: '#ffa33f', paint: '#354b46', minHeight: 8, maxHeight: 18, buildingStyle: 'workshop', subtitle: '管道 · 检修 · 夜班工坊',
    signs: ['機電工坊', '義體修理', '精密機械', '夜班維修'],
    shops: ['機電工坊', '義體修理', '夜班維修', '精密機械', '液壓零件', '伺服馬達', '軸承行', '焊接工班', '冷卻管路', '工業塗裝', '配電盤', '光學校正', '機械手臂', '廢料回收'] },
  { id: 'center', name: '霓虹老街', sign: '霓虹老街', english: 'NEON CROSSING', cx: 0, cz: 0, primary: '#43e7ed', secondary: '#fb48b2', paint: '#344557', minHeight: 6, maxHeight: 20, buildingStyle: 'original', subtitle: '茶摊 · 招牌 · 雨夜十字街', preset: 'street',
    // The centre is the hand-built compact block in index.html, so it owns no generated signs.
    signs: [],
    shops: [] },
  { id: 'east', name: '霓虹剧场', sign: '霓虹劇場', english: 'NEON THEATRE', cx: 42, cz: 0, primary: '#ff4dce', secondary: '#696cff', paint: '#483353', minHeight: 14, maxHeight: 26, buildingStyle: 'theatre', subtitle: '演出 · 海报 · 不夜剧场',
    signs: ['霓虹劇場', '午夜電音', '星河戲院', '銀河唱片'],
    shops: ['霓虹劇場', '午夜電音', '星河戲院', '銀河唱片', '霓裳舞臺', '午夜首映', '黑膠唱片', '雷射秀場', '默片放映', '爵士酒吧', '魔術劇場', '電音倉庫', '演員後台', '夜場售票'] },
  { id: 'southwest', name: '南巷夜市', sign: '南巷夜市', english: 'SOUTH ALLEY MARKET', cx: -42, cz: 48, primary: '#ff7256', secondary: '#ffc257', paint: '#5b4538', minHeight: 6, maxHeight: 12, buildingStyle: 'market', subtitle: '骑楼 · 灯笼 · 深夜食堂',
    signs: ['南巷夜市', '龍記燒臘', '南巷大牌檔', '夜市管委會'],
    shops: ['南巷夜市', '深夜食堂', '龍記燒臘', '港式茶檔', '煲仔飯', '雲吞麵家', '涼茶鋪', '糖水店', '大排檔', '燒味檔', '雞蛋仔', '魚蛋粉', '滷味攤', '夜宵粥店'] },
  { id: 'south', name: '九龍通勤', sign: '九龍車站', english: 'KOWLOON TRANSIT', cx: 0, cz: 48, primary: '#ffe6b1', secondary: '#ff913a', paint: '#4b4b46', minHeight: 10, maxHeight: 20, buildingStyle: 'residential', subtitle: '外廊 · 食堂 · 夜班列车',
    signs: ['九龍車站', '站前廣場', '通勤公寓', '九龍車務段'],
    shops: ['九龍車站', '夜班食堂', '便利商店', '通勤公寓', '月台便當', '站前藥局', '通宵書報', '儲物櫃房', '旅運中心', '電車修理', '候車茶室', '行李寄放', '夜班診所', '值夜室'] },
  { id: 'southeast', name: '午夜旅舍', sign: '午夜旅舍', english: 'MIDNIGHT HOTEL', cx: 42, cz: 48, primary: '#ff9ad4', secondary: '#77e2c3', paint: '#514452', minHeight: 10, maxHeight: 18, buildingStyle: 'hotel', subtitle: '阳台 · 花园 · 午夜客房',
    signs: ['午夜旅舍', '月光酒店', '海棠公寓', '天台花園'],
    shops: ['午夜旅舍', '月光酒店', '天台花園', '海棠公寓', '夜班櫃檯', '行李房', '客房服務', '晚安酒吧', '晨喚服務', '洗衣房', '雪茄陽台', '頂樓花房', '蜜月套房', '夜班門房'] },
].map(style => Object.freeze({ ...style, shops: Object.freeze(style.shops), signs: Object.freeze(style.signs) }));

Object.freeze(DISTRICT_STYLES);
export const OUTER_DISTRICT_STYLES = Object.freeze(DISTRICT_STYLES.filter(style => style.id !== 'center'));
export function getDistrictStyle(id) { return DISTRICT_STYLES.find(style => style.id === id); }
