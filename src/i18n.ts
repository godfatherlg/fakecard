import { getLanguage, moment } from 'obsidian';

/** UI languages the plugin ships with; everything else falls back to English. */
type Lang = 'en' | 'zh';

/**
 * Settings-tab strings. Keys follow `<section>.<field>.<part>`; both maps are
 * typed against the English one, so a missing translation fails the build.
 */
const EN = {
    'library.heading': 'Library',
    'library.folder.name': 'Card library folder',
    'library.folder.desc': 'Folder inside the vault that holds the cards. Changing it switches to another library; the old files are left untouched.',
    'library.decks.name': 'Decks',
    'library.decks.desc': 'One deck name per line. These are the decks offered when creating or editing a card, and by the Browse filter.',
    'library.defaultDeck.name': 'Default deck for new cards',
    'library.defaultDeck.desc': 'Where a newly created card goes when the panel does not pick a deck.',

    'creation.heading': 'Card creation',
    'creation.marker.name': 'Heading marker',
    'creation.marker.desc': 'A heading that contains this symbol is treated as a Q&A card: the heading becomes the question and the text under it becomes the answer. The symbol itself is removed from the question.',
    'creation.altClick.name': 'Alt+click an image to make an occlusion card',
    'creation.altClick.desc': 'Holding Alt and clicking an image in the editor opens the mask panel directly. The normal right-click menu stays untouched either way.',
    'creation.childCards.name': 'Child cards',
    'creation.childCards.desc': 'Pause a card that keeps failing and study it through easier stand-ins. Children graduate after a Good streak; when every child has graduated, the parent comes back.',
    'creation.goodStreak.name': 'Good streak to graduate a child',
    'creation.goodStreak.desc': 'Consecutive Good or Easy ratings a child needs before it graduates.',
    'creation.hardStreak.name': 'Failing score before a hint',
    'creation.hardStreak.desc': 'Hard adds 1 point, Again adds the score below; once the current failing run reaches this score, review offers to build a simpler card from it. A Good or Easy ends the run.',
    'creation.againScore.name': 'Score an Again adds',
    'creation.againScore.desc': 'Points an Again rating adds to the failing score (Hard always adds 1). 0 keeps Again in the run without adding points.',

    'review.heading': 'Review',
    'review.newPerDay.name': 'New cards per day',
    'review.newPerDay.desc': 'How many unseen cards are introduced per day.',
    'review.maxPerDay.name': 'Maximum reviews per day',
    'review.maxPerDay.desc': 'Upper bound on cards shown in a single day.',
    'review.answerTime.name': 'Show suggested answer time',
    'review.answerTime.desc': 'Once a card passes its suggested time, review shows how long it has been on screen. The budget is a base plus reading time for the answer, adjusted by the card\'s rating history.',
    'review.answerBase.name': 'Answer time: base seconds',
    'review.answerBase.desc': 'Seconds allowed for a short answer before reading time is added.',
    'review.answerChunk.name': 'Answer time: seconds per 40 characters',
    'review.answerChunk.desc': 'Reading time added for every 40 characters of answer, on top of the base. 0 ignores answer length.',
    'review.answerWeight.name': 'Answer time: rating history weight (%)',
    'review.answerWeight.desc': 'Positive gives cards you keep failing more time (slow recall). Negative nudges them earlier (counters overthinking). 0 ignores rating history.',

    'display.heading': 'Card display',
    'display.maskAll.name': 'Mask all groups on the front',
    'display.maskAll.desc': 'On: every group of a cloze or image card is hidden on the front (the answer side always reveals everything). Off: only the group this card asks is hidden, the other groups stay visible.',

    'exam.heading': 'Exam plan',
    'exam.plans.name': 'Exam plans',
    'exam.plans.desc': 'Each plan has its own countdown, decks and share, so several exams can be planned side by side (one per subject, for example). Building a plan only reschedules the cards in its own decks. A plan disappears once its exam day is over; the cards stay and go back to the normal FSRS schedule.',
    'exam.plans.empty': 'No exam plans yet.',
    'exam.plans.add': 'Add an exam plan',
    'exam.plan.days': 'Days until the exam',
    'exam.plan.daysUnit': 'days',
    'exam.plan.decks': 'Decks',
    'exam.plan.ratio': 'Share of cards',
    'exam.plan.build': 'Build',
    'exam.plan.delete': 'Delete this plan',
    'exam.estimate.line': '≈ {perDay} card(s) per day, over {days} day(s)',
    'exam.estimate.detail': '{moved} of the {selected} selected cards are due after the exam and get spread out (daily cap {cap}).',
    'exam.estimate.empty': 'No reviewed cards in these decks yet.',
    'exam.estimate.overloaded': 'More cards than the daily review limit allows - lower the share.',

    'io.heading': 'Import and export',
    'io.external.name': 'External AI / tools',
    'io.external.desc': 'No model is built in. Any tool can push cards through "obsidian://fakecard?data=<url-encoded JSON>" or the clipboard button below. JSON shape: [{"type":"qa","front":"...","back":"..."},{"type":"cloze","clozeText":"{{c1::...}}"}] - ==highlights== are accepted too.',
    'io.clipboard.name': 'Import cards from the clipboard',
    'io.clipboard.desc': 'Reads JSON from the clipboard.',
    'io.clipboard.button': 'Import',
    'io.apkg.name': 'Import an Anki deck (.apkg)',
    'io.apkg.desc': 'Basic, cloze and image-occlusion notes are converted.',
    'io.apkg.button': 'Choose file',
    'io.export.name': 'Export all cards',
    'io.export.desc': 'Writes every card (including FSRS state) to a JSON file in the library folder.',
    'io.export.button': 'Export',
    'io.housekeeping.name': 'Housekeeping',
    'io.housekeeping.desc': 'Removes orphan cards whose note was deleted, or graduated child cards. Both write a backup first.',
    'io.orphans.button': 'Clean orphans',
    'io.graduated.button': 'Clean graduated',

    'whatsNew.title': "What's new",
    'whatsNew.notes': 'See the full release notes',
    'whatsNew.close': 'Got it',
};

/** Key of a settings string; keeps callers in sync with the English map. */
export type UiTextKey = keyof typeof EN;

const ZH: Record<UiTextKey, string> = {
    'library.heading': '卡片库',
    'library.folder.name': '卡片库文件夹',
    'library.folder.desc': '存放卡片的库内文件夹。换成别的文件夹等于切换到另一个卡片库，旧文件仍原样保留。',
    'library.decks.name': '牌组',
    'library.decks.desc': '每行一个牌组名。创建或编辑卡片时可选这些牌组，浏览视图的筛选也使用它们。',
    'library.defaultDeck.name': '新卡片默认牌组',
    'library.defaultDeck.desc': '面板没有指定牌组时，新建卡片进入这里。',

    'creation.heading': '卡片创建',
    'creation.marker.name': '标题标记符号',
    'creation.marker.desc': '含此符号的标题会被当作问答卡：标题作为问题，标题下的正文作为答案；符号本身会从问题里去掉。',
    'creation.altClick.name': '按住 Alt 点击图片创建遮挡卡',
    'creation.altClick.desc': '在编辑器中按住 Alt 点击图片会直接打开遮挡面板；常规右键菜单不受影响。',
    'creation.childCards.name': '子卡片',
    'creation.childCards.desc': '反复出错的卡片先暂停，改用更容易的替代卡片学习。子卡片连续评 Good 后毕业；全部毕业后原卡片自动恢复。',
    'creation.goodStreak.name': '子卡片毕业所需的 Good 连续次数',
    'creation.goodStreak.desc': '子卡片需要连续获得 Good 或 Easy 的次数。',
    'creation.hardStreak.name': '触发提示所需的失败分',
    'creation.hardStreak.desc': 'Hard 记 1 分，Again 记下面设置的分数；最近这一轮失败累计达到此分数时，复习时会给出一张更简单卡片的建卡入口。任意 Good 或 Easy 都会结束这一轮。',
    'creation.againScore.name': 'Again 记几分',
    'creation.againScore.desc': 'Again 在失败分里折算的分数（Hard 固定记 1 分）。设为 0 时 Again 仍算在失败连续中，但不加分。',

    'review.heading': '复习',
    'review.newPerDay.name': '每天新卡数量',
    'review.newPerDay.desc': '每天引入多少张尚未学过的新卡片。',
    'review.maxPerDay.name': '每天复习上限',
    'review.maxPerDay.desc': '单日最多展示的卡片数量。',
    'review.answerTime.name': '显示建议作答时间',
    'review.answerTime.desc': '卡片超过预估用时后，复习界面会显示它已经在屏幕上停留了多久。预估由基础时间加上答案的阅读时间，再按这张卡的评分历史调整。',
    'review.answerBase.name': '作答时间：基础秒数',
    'review.answerBase.desc': '加上阅读时间之前，简短回答可用的秒数。',
    'review.answerChunk.name': '作答时间：每 40 字增加的秒数',
    'review.answerChunk.desc': '在基础时间之上，答案每 40 个字符追加的阅读时间。设为 0 表示完全不考虑答案长度。',
    'review.answerWeight.name': '作答时间：评分历史权重（%）',
    'review.answerWeight.desc': '正数给反复失败的卡片更多时间（慢慢回忆）。负数让这类卡片更早提示（避免过度纠结）。0 表示不考虑历史。',

    'display.heading': '卡片显示',
    'display.maskAll.name': '正面遮住所有分组',
    'display.maskAll.desc': '开：填空题或图片卡的正面遮住所有分组（答案面始终全部显示）。关：只遮住本卡片所问的分组，其他分组保持可见。',

    'exam.heading': '考试计划',
    'exam.plans.name': '考试计划',
    'exam.plans.desc': '每个计划有自己的剩余天数、牌组和参与比例，可以同时存在多个（比如按科目分开）。生成某个计划只会重排它自己牌组里的卡片。考试当天过后计划自动消失，卡片保留并回到常规 FSRS 排程。',
    'exam.plans.empty': '还没有考试计划。',
    'exam.plans.add': '添加考试计划',
    'exam.plan.days': '还有多久考试',
    'exam.plan.daysUnit': '天',
    'exam.plan.decks': '牌组',
    'exam.plan.ratio': '参与比例',
    'exam.plan.build': '生成',
    'exam.plan.delete': '删除这个计划',
    'exam.estimate.line': '≈ 每天 {perDay} 张，共 {days} 天',
    'exam.estimate.detail': '选中的 {selected} 张里有 {moved} 张排在考试之后，会被铺到考前（每日上限 {cap}）。',
    'exam.estimate.empty': '这些牌组里还没有可排的卡。',
    'exam.estimate.overloaded': '数量超过每日复习上限，建议降低比例。',

    'io.heading': '导入与导出',
    'io.external.name': '外部 AI / 工具',
    'io.external.desc': '插件不内置任何模型。任何工具都可以通过 "obsidian://fakecard?data=<url-encoded JSON>" 或下面的剪贴板按钮推送卡片。JSON 结构：[{"type":"qa","front":"...","back":"..."},{"type":"cloze","clozeText":"{{c1::...}}"}] - 也接受 ==高亮==。',
    'io.clipboard.name': '从剪贴板导入卡片',
    'io.clipboard.desc': '从剪贴板读取 JSON。',
    'io.clipboard.button': '导入',
    'io.apkg.name': '导入 Anki 牌组（.apkg）',
    'io.apkg.desc': '会转换基础卡、填空卡和图片遮挡笔记。',
    'io.apkg.button': '选择文件',
    'io.export.name': '导出全部卡片',
    'io.export.desc': '把所有卡片（含 FSRS 状态）写入卡片库文件夹中的 JSON 文件。',
    'io.export.button': '导出',
    'io.housekeeping.name': '清理维护',
    'io.housekeeping.desc': '删除来源笔记已被删除的孤儿卡片，或已毕业的子卡片；两者都会先写备份。',
    'io.orphans.button': '清理孤儿卡',
    'io.graduated.button': '清理已毕业',

    'whatsNew.title': '更新内容',
    'whatsNew.notes': '查看完整发布说明',
    'whatsNew.close': '知道了',
};

/** Language picked in Obsidian; falls back to the moment locale, then English. */
function detectLang(): Lang {
    const tag = (getLanguage() || moment.locale() || 'en').toLowerCase();
    return tag.startsWith('zh') ? 'zh' : 'en';
}

/** Settings text for the current Obsidian language. */
export function t(key: UiTextKey): string {
    return detectLang() === 'zh' ? ZH[key] : EN[key];
}

/** Same as `t`, with `{name}` placeholders filled in. */
export function tf(key: UiTextKey, vars: Record<string, string | number>): string {
    return t(key).replace(/\{(\w+)\}/g, (match, name: string) => (
        name in vars ? String(vars[name]) : match
    ));
}

/**
 * Whether the UI is Chinese. Long-form text that is not a single settings
 * string (the release notes in the "what is new" dialog) picks its language
 * with this, so such strings do not have to be keyed one by one.
 */
export function isChinese(): boolean {
    return detectLang() === 'zh';
}
