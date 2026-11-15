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
    'creation.hardStreak.name': 'Hard streak before a hint',
    'creation.hardStreak.desc': 'Consecutive Hard ratings on a child card before review suggests simplifying it.',

    'review.heading': 'Review',
    'review.newPerDay.name': 'New cards per day',
    'review.newPerDay.desc': 'How many unseen cards are introduced per day.',
    'review.maxPerDay.name': 'Maximum reviews per day',
    'review.maxPerDay.desc': 'Upper bound on cards shown in a single day.',
    'review.answerTime.name': 'Show suggested answer time',
    'review.answerTime.desc': 'Review shows an estimated time for the current card: a base budget plus reading time for the answer, adjusted by how hard the card has been.',
    'review.answerBase.name': 'Answer time: base seconds',
    'review.answerBase.desc': 'Seconds allowed for a short answer before reading time is added.',

    'display.heading': 'Card display',
    'display.maskAll.name': 'Mask all groups on the front',
    'display.maskAll.desc': 'On: every group of a cloze or image card is hidden on the front (the answer side always reveals everything). Off: only the group this card asks is hidden, the other groups stay visible.',

    'exam.heading': 'Exam plan',
    'exam.date.name': 'Exam date',
    'exam.date.desc': 'Target date (YYYY-MM-DD). The exam plan spreads the selected cards across the days until then, so nothing lands after the exam. Once the date passes, the plan is dropped automatically and cards return to the normal FSRS schedule.',
    'exam.decks.name': 'Exam plan: decks',
    'exam.decks.desc': 'Comma separated deck names to include (empty = every deck). Cards from these decks are still ordered by difficulty, so the hardest ones enter the plan first.',
    'exam.ratio.name': 'Exam plan: share of cards',
    'exam.ratio.desc': 'How many cards join the plan, hardest first. 100% = every card; lower means fewer cards per day, at the cost of coverage.',
    'exam.build.name': 'Build the exam plan now',
    'exam.build.desc': 'Applies the settings above: pulls cards due after the exam into the remaining days and writes a backup first.',
    'exam.build.button': 'Build plan',

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
    'creation.hardStreak.name': '触发提示所需的 Hard 连续次数',
    'creation.hardStreak.desc': '子卡片连续评为 Hard 达到此次数后，复习时会建议简化它。',

    'review.heading': '复习',
    'review.newPerDay.name': '每天新卡数量',
    'review.newPerDay.desc': '每天引入多少张尚未学过的新卡片。',
    'review.maxPerDay.name': '每天复习上限',
    'review.maxPerDay.desc': '单日最多展示的卡片数量。',
    'review.answerTime.name': '显示建议作答时间',
    'review.answerTime.desc': '复习时给出当前卡片的预估用时：基础时间加上答案的阅读时间，并按这张卡以往的难度调整。',
    'review.answerBase.name': '作答时间：基础秒数',
    'review.answerBase.desc': '加上阅读时间之前，简短回答可用的秒数。',

    'display.heading': '卡片显示',
    'display.maskAll.name': '正面遮住所有分组',
    'display.maskAll.desc': '开：填空题或图片卡的正面遮住所有分组（答案面始终全部显示）。关：只遮住本卡片所问的分组，其他分组保持可见。',

    'exam.heading': '考试计划',
    'exam.date.name': '考试日期',
    'exam.date.desc': '目标日期（YYYY-MM-DD）。考试计划会把选中的卡片分摊到考前各天，不会有卡片排到考试之后。日期过去后计划自动取消，卡片回到常规 FSRS 排程。',
    'exam.decks.name': '考试计划：牌组',
    'exam.decks.desc': '要纳入的牌组名，用逗号分隔（留空表示全部牌组）。这些牌组内的卡片仍按难度排序，最难的先进入计划。',
    'exam.ratio.name': '考试计划：参与卡片比例',
    'exam.ratio.desc': '有多少卡片加入计划，从最难的开始。100% 表示全部卡片；比例越低每天卡片越少，但覆盖的内容也更少。',
    'exam.build.name': '立即生成考试计划',
    'exam.build.desc': '应用上面的设置：把考试之后到期的卡片拉回考前的剩余天数，并先写入一份备份。',
    'exam.build.button': '生成计划',

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
