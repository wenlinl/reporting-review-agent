/**
 * 会议万能小助手「茵姐」的知识库数据源。
 * 数据以最新版 Excel（Agenda final）为准。
 * 隐私规则：餐食/团建等个人选择只对本人可见，其他同事的信息一律不对外提供。
 * 注意：证件号码属于隐私，不放入知识库。
 */

export const meetingInfo = {
  event: {
    name: "2026 Mid-Year Communication Workshop",
    shortName: "2026年8月MCICPR Workshop",
    theme: "High Impact 项目汇报",
    dates: "2026年8月9日（周日）— 8月12日（周三），共 4 天 3 晚",
    venue: "杭州湘湖逍遥庄园（杭州市萧山区岳王路256号）",
    subVenue: "8月11日分会场：天泽楼茶书院（西湖店），地址：西湖街道杨公堤29号",
    hotelIntro:
      "坐落于湘湖旅游度假区内，背山面水；湘湖是西湖的「姐妹湖」，环境雅致清幽",
  },
  weather: {
    note: "天气联网查询，重点提示降雨概率与穿衣建议",
  },
  accommodation: {
    booking: "酒店房间已统一提前预留，不需要自行订房，抵达后直接到前台办理入住",
    checkin: "建议 8月9日 17:00 前抵达酒店办理入住",
    checkout: "8月12日 13:00 之后可办理离店返程",
  },
  transport: {
    southRail: "杭州火车南站：约 15 分钟车程",
    eastRail: "杭州火车东站：约 30 分钟车程",
    airport: "杭州萧山国际机场：约 40 分钟车程",
    special: "8月10日 19:00 酒店统一发车前往光影秀场地（大巴接送）",
  },
  schedule: [
    {
      day: "Day 1｜8月9日（周日）｜湘湖逍遥庄园",
      items: [
        { time: "18:00-19:00", item: "晚餐", location: "水漾中餐厅（南区2F）" },
        { time: "19:30-20:15", item: "团建手工体验：宋韵点茶 / 植物扎染（二选一，也可不参加）", location: "庄园内：点茶在淞间堂茶室（L层），扎染在瑜伽室（L层）" },
      ],
    },
    {
      day: "Day 2｜8月10日（周一）｜主会场：湘湖逍遥庄园 观荷厅（南区1F）",
      items: [
        { time: "08:45-09:00", item: "暖场活动", location: "主会场 观荷厅" },
        { time: "09:00-09:15", item: "开场致辞（Tao Li / Clare Zhang）", location: "主会场 观荷厅" },
        { time: "09:15-09:30", item: "AI 诗歌互动环节（Julie Xu）", location: "主会场 观荷厅" },
        { time: "09:30-10:30", item: "高影响力项目复盘：1-3 号讲者", location: "主会场 观荷厅" },
        { time: "10:30-10:40", item: "茶歇", location: "主会场 观荷厅" },
        { time: "10:40-12:00", item: "高影响力项目复盘：4-7 号讲者", location: "主会场 观荷厅" },
        { time: "12:00-13:00", item: "午餐", location: "云从全日餐厅（南区1F）" },
        { time: "13:00-14:40", item: "高影响力项目复盘：8-12 号讲者", location: "主会场 观荷厅" },
        { time: "14:40-15:00", item: "下午茶歇", location: "主会场 观荷厅" },
        { time: "15:00-16:40", item: "高影响力项目复盘：13-17 号讲者", location: "主会场 观荷厅" },
        { time: "16:40-17:00", item: "当日总结与整体点评（Tao Li）", location: "主会场 观荷厅" },
        { time: "18:00-19:00", item: "晚餐（米其林配餐）", location: "水漾中餐厅（南区2F）" },
        { time: "19:00", item: "酒店统一发车", location: "前往光影秀场地" },
        { time: "19:40-21:00", item: "团建活动《湘湖·雅韵》实景光影秀（自愿参加）", location: "光影秀场地" },
      ],
    },
    {
      day: "Day 3｜8月11日（周二）｜分会场：天泽楼茶书院（西湖店）",
      items: [
        { time: "09:00-09:15", item: "开场致辞（Tao Li）", location: "分会场 天泽楼茶书院" },
        { time: "09:15-09:45", item: "Galaxy 项目更新分享（Isaac Yuan）", location: "分会场 天泽楼茶书院" },
        { time: "09:45-10:15", item: "部门 AI 应用实践与案例分享（Isaac Yuan）", location: "分会场 天泽楼茶书院" },
        { time: "10:15-10:30", item: "茶歇", location: "分会场 天泽楼茶书院" },
        { time: "10:30-11:00", item: "AI Prism 挑战项目展示 I（Eric Li）", location: "分会场 天泽楼茶书院" },
        { time: "11:00-11:30", item: "AI Prism 挑战项目展示 II（Jane Liang）", location: "分会场 天泽楼茶书院" },
        { time: "11:30-13:00", item: "午餐（茶书院套餐，可自由选择）", location: "分会场 天泽楼茶书院" },
        { time: "13:00-18:00", item: "Claude 实操能力提升工作坊（外部专家带教）", location: "分会场 天泽楼茶书院" },
        { time: "18:30-19:30", item: "晚餐", location: "西湖景观餐厅" },
        { time: "19:30", item: "团建神秘任务（现场揭晓）", location: "西湖周边" },
      ],
    },
    {
      day: "Day 4｜8月12日（周三）｜主会场：湘湖逍遥庄园 观荷厅（南区1F）",
      items: [
        { time: "08:30-08:45", item: "暖场活动", location: "主会场 观荷厅" },
        { time: "08:45-09:00", item: "开场致辞（Tao Li）", location: "主会场 观荷厅" },
        { time: "09:00-10:30", item: "Go To Market Lab（David Ni）", location: "主会场 观荷厅" },
        { time: "10:30-10:45", item: "茶歇", location: "主会场 观荷厅" },
        { time: "10:45-12:15", item: "商业洞察与营销共创工作坊（Flora Xu / Tony Lv）", location: "主会场 观荷厅" },
        { time: "12:15-12:20", item: "整体总结与闭幕", location: "主会场 观荷厅" },
        { time: "12:20-13:00", item: "午餐", location: "云从全日餐厅（南区1层）" },
      ],
    },
  ],
  meals: {
    common: "8月10日、8月12日午餐标配：香油酱菜 + 白米饭；餐后 4 种新鲜水果 + 2 款饮品不限量自助。饮食忌口可在表单备注或私信活动负责人。",
    options: [
      "套餐A 清爽鲜口：冬瓜老鸭汤、红烧排骨、清蒸鲈鱼、三道时令素菜",
      "套餐B 滋补浓郁：乳鸽汤、土豆烧牛腩、椒盐虾、三道时令素菜",
      "套餐C 萧山特色款：虫草花老鸡汤、鲍鱼红烧肉、白灼沼虾、本地特色素菜",
      "套餐D 下饭小炒款：玉米排骨汤、彩椒牛肉粒、宫保虾球、多款清炒时蔬",
    ],
    day1Dinner: {
      desc: "8月9日 晚餐：湘湖逍遥庄园 水漾中餐厅（南区2F）",
    },
    day2Dinner: {
      desc: "8月10日 晚餐：水漾中餐厅（南区2F），米其林配餐",
    },
    day3Lunch: {
      desc: "8月11日 午餐：天泽楼茶书院，牛肉土豆 / 梅干菜肉 / 巴沙鱼三款套餐可自由选择，份数不固定",
    },
    day3Dinner: { desc: "8月11日 晚餐：西湖景观餐厅，统一安排" },
    day4Lunch: {
      desc: "8月12日 午餐：云从全日餐厅（南区1层），A/B/C/D 四档套餐自选；整体选择统计：套餐A 11 人、套餐B 5 人、套餐C 4 人、套餐D 2 人（个人选择明细未同步，问具体个人时如实说明）",
    },
  },
  teamBuilding: {
    day1Craft: {
      desc: "8月9日 19:30-20:15 手工体验（45 分钟，二选一，也可不参加）：点茶在淞间堂茶室（L层），扎染在瑜伽室（L层）",
      tea: "宋韵点茶体验：沉浸式古法宋韵雅集，学宋代茶道、品茶体验；有团队比赛环节（比摇盏时间、图案准确度，图案含“福”字、莱宝线条、荷花图案）",
      dye: "植物扎染手作：传统靛蓝工艺，亲手制作专属扎染小物件，成品可带走",
    },
    day2LightShow: {
      desc: "8月10日 19:40-21:00《湘湖·雅韵》实景光影秀：亚运主题沉浸式湖景演艺，演绎跨湖桥、良渚、宋韵千年江南历史，亚运会开闭幕式总导演团队打造；19:00 酒店统一大巴接送，纸质票提前发放，专属 VIP 观演席位，自愿参加",
    },
    day3Mystery: {
      desc: "8月11日 19:30 开始，西湖周边沉浸式团队神秘任务，内容现场揭晓，全员参与",
    },
    combo: "三项团建互不冲突：9 日手工二选一（或不参加）、10 日光影秀单独可选、11 日神秘任务全员参与，可自由搭配",
  },
  accounts: [
    { name: "Wendy Ding", email: "wendy.ding@tuv.com", role: "活动负责人" },
    { name: "Menny Zhang", email: "menny.zhang@tuv.com", role: "参会人" },
    { name: "Eunice Wu", email: "eunice.wu@tuv.com", role: "参会人" },
    { name: "Betsy Wang", email: "betsy.wang@tuv.com", role: "参会人" },
    { name: "Jancy Meng", email: "jancy.meng@tuv.com", role: "参会人" },
    { name: "Eric Li", email: "ericqm.li@tuv.com", role: "参会人" },
    { name: "Sally Zhang", email: "sallyzy.zhang@tuv.com", role: "参会人" },
    { name: "Flora Xu", email: "2405520865@qq.com", role: "参会人" },
    { name: "David Ni", email: "david.ni@tuv.com", role: "参会人" },
    { name: "Tony Lv", email: "tony.lv@tuv.com", role: "参会人" },
    { name: "Julie Xu", email: "Julie.Xu@tuv.com", role: "参会人" },
    { name: "Simon Hung", email: "simon.hung@tuv.com", role: "参会人" },
    { name: "Yuki Ye", email: "yuki.ye@tuv.com", role: "参会人" },
    { name: "Jane Liang", email: "Jane.Liang@tuv.com", role: "参会人" },
    { name: "Wenlin Leng", email: "Wenlin.Leng@tuv.com", role: "参会人" },
    { name: "Isaac Yuan", email: "isaac.yuan@tuv.com", role: "参会人" },
  ],
  // 英文名与 Excel 最新版一致，也是平台登录账号名；8月10日午餐以最新版为准
  participants: [
    { name: "Wendy Ding", craft: "宋韵点茶", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Yuki Ye", craft: "未参加", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "David Ni", craft: "宋韵点茶", lightShow: "未参加", lunch10: "套餐C 萧山特色款" },
    { name: "Jane Liang", craft: "宋韵点茶", lightShow: "未参加", lunch10: "套餐C 萧山特色款" },
    { name: "Eric Li", craft: "宋韵点茶", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Julie Xu", craft: "植物扎染", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Wenlin Leng", craft: "宋韵点茶", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Eunice Wu", craft: "植物扎染", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Jancy Meng", craft: "植物扎染", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Presley Wang", craft: "植物扎染", lightShow: "参加", lunch10: "套餐A 清爽鲜口" },
    { name: "Tony Lv", craft: "宋韵点茶", lightShow: "未参加", lunch10: "套餐C 萧山特色款" },
    { name: "Clare Zhang", craft: "宋韵点茶", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Menny Zhang", craft: "宋韵点茶", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Flora Xu", craft: "植物扎染", lightShow: "未参加", lunch10: "套餐C 萧山特色款" },
    { name: "Sally Zhang", craft: "植物扎染", lightShow: "未参加", lunch10: "套餐C 萧山特色款" },
    { name: "Jing Ho", craft: "未参加", lightShow: "未参加", lunch10: "套餐A 清爽鲜口" },
    { name: "Simon Hung", craft: "植物扎染", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Sofia Y.J. Lai", craft: "未参加", lightShow: "未参加", lunch10: "套餐C 萧山特色款" },
    { name: "Isaac Yuan", craft: "未参加", lightShow: "参加", lunch10: "套餐C 萧山特色款" },
    { name: "Tao Li", craft: "宋韵点茶", lightShow: "参加", lunch10: "套餐A 清爽鲜口" },
    { name: "Sally Chang", craft: "未参加", lightShow: "未参加", lunch10: "套餐A 清爽鲜口" },
    { name: "Betsy Wang", craft: "未参加", lightShow: "未参加", lunch10: "8月10日当天出差、晚上入住酒店，不吃午餐" },
  ],
  contacts: {
    organizer: "Wendy Ding",
    note: "无法参会、个人特殊需求、饮食忌口等，可在表单备注或私信活动负责人（Wendy Ding）报备",
  },
};

/** 当前提问人的姓名（与登录账号对应），用于只返回本人个人信息的隐私逻辑 */
export function resolveParticipantName(userName: string, userEmail: string): string | null {
  const email = userEmail.toLowerCase();
  const byName = meetingInfo.participants.find(
    (p) => p.name.toLowerCase() === userName.toLowerCase(),
  );
  if (byName) return byName.name;
  const byEmail = meetingInfo.accounts.find(
    (a) => a.email.toLowerCase() === email,
  );
  return byEmail?.name ?? null;
}

export function buildMeetingBriefing(currentUserName: string | null): string {
  const d = meetingInfo;
  const L: string[] = [];
  L.push(`【会议基础信息】`);
  L.push(`- 活动全称：${d.event.name} / ${d.event.shortName}`);
  L.push(`- 活动时间：${d.event.dates}`);
  L.push(`- 主会场：${d.event.venue}`);
  L.push(`- 分会场：${d.event.subVenue}`);
  L.push(`- 酒店小介绍：${d.event.hotelIntro}`);
  L.push(`- 天气：${d.weather.note}`);
  L.push(`- 特殊事项报备：${d.contacts.note}`);
  L.push("");
  L.push(`【住宿与出行】`);
  L.push(`- 住宿：${d.accommodation.booking}；建议抵达 ${d.accommodation.checkin}；建议离店 ${d.accommodation.checkout}`);
  L.push(`- 车程参考：杭州火车南站 ${d.transport.southRail}；杭州火车东站 ${d.transport.eastRail}；杭州萧山国际机场 ${d.transport.airport}`);
  L.push(`- 特殊交通：${d.transport.special}`);
  L.push("");
  L.push(`【完整日程】`);
  for (const day of d.schedule) {
    L.push(`### ${day.day}`);
    for (const it of day.items) {
      L.push(`- ${it.time}｜${it.item}（地点：${it.location}）`);
    }
    L.push("");
  }
  L.push(`【餐饮安排】`);
  L.push(`- 通用标配：${d.meals.common}`);
  L.push(`- 8月10日、8月12日午餐四档套餐选项：`);
  for (const o of d.meals.options) L.push(`  - ${o}`);
  L.push(`- ${d.meals.day1Dinner.desc}`);
  L.push(`- ${d.meals.day2Dinner.desc}`);
  L.push(`- ${d.meals.day3Lunch.desc}`);
  L.push(`- ${d.meals.day3Dinner.desc}`);
  L.push(`- ${d.meals.day4Lunch.desc}`);
  L.push("");
  L.push(`【团建项目】`);
  L.push(`- 8月9日手工体验：${d.teamBuilding.day1Craft.desc}`);
  L.push(`  - 宋韵点茶：${d.teamBuilding.day1Craft.tea}`);
  L.push(`  - 植物扎染：${d.teamBuilding.day1Craft.dye}`);
  L.push(`- 8月10日光影秀：${d.teamBuilding.day2LightShow.desc}`);
  L.push(`- 8月11日神秘任务：${d.teamBuilding.day3Mystery.desc}`);
  L.push(`- 组合说明：${d.teamBuilding.combo}`);
  L.push("");
  L.push(`【当前提问人的个人选择记录】`);
  if (currentUserName) {
    const p = d.participants.find(
      (x) => x.name.toLowerCase() === currentUserName.toLowerCase(),
    );
    if (p) {
      L.push(`- 当前提问人：${p.name}`);
      L.push(`  - 8月10日午餐=${p.lunch10}`);
      L.push(`  - 8月9日手工体验=${p.craft}`);
      L.push(`  - 8月10日光影秀=${p.lightShow}`);
      L.push(`  - 8月11日神秘任务=全员参与`);
      L.push(`  - 8月12日午餐=个人选择明细未同步（整体统计：套餐A 11人 / B 5人 / C 4人 / D 2人）`);
    } else {
      L.push(`- 当前提问人：${currentUserName}（暂未在参会记录中匹配到个人选择）`);
    }
  } else {
    L.push("- （无法确认当前提问人身份，暂不提供个人选择信息）");
  }
  L.push("- 其他同事的个人餐食、团建等选择属于隐私，不对外提供。");
  L.push("");
  L.push(`【活动负责人】${d.contacts.organizer}`);
  return L.join("\n");
}
