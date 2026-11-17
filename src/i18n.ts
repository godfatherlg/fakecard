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

    'review.heading': 'Review screen',
    'pace.heading': 'Daily pace',
    'ahead.heading': 'Study ahead',
    'review.newPerDay.name': 'New cards per day',
    'review.newPerDay.desc': 'How many unseen cards are introduced per day. Held back while due cards exceed the daily limit.',
    'review.maxPerDay.name': 'Maximum reviews per day',
    'review.maxPerDay.desc': 'The day\'s base ceiling. "Study more today" raises it for the current session only.',
    'review.aheadBatch.name': 'Cards per study-ahead batch',
    'review.aheadBatch.desc': 'When today\'s queue is empty, "study ahead" pulls this many cards that are not due yet. Their intervals are shortened by how early they are.',
    'review.aheadOrder.name': 'Study ahead: pick cards by',
    'review.aheadOrder.desc': 'The order a study-ahead batch borrows from the future: the ones you keep failing, or the ones due soonest.',
    'review.aheadOrder.hardest': 'Hardest first (most misses, then FSRS difficulty)',
    'review.aheadOrder.earliest': 'Earliest due date first',
    'review.pauseNew.name': 'Hold new cards while behind',
    'review.pauseNew.desc': 'When due cards already exceed the daily limit, introduce no new cards until the queue is smaller. Nothing is rescheduled: new cards simply wait, and the FSRS state of learned cards is untouched.',
    'review.boostStep.name': 'Cards added by "study more today"',
    'review.boostStep.desc': 'How many extra reviews one press allows. Leave the field empty for automatic: a tenth of the daily limit, at least 10.',
    'review.boostStep.auto': 'automatic',
    'review.scaleEarly.name': 'Scale intervals for early reviews',
    'review.scaleEarly.desc': 'When a card is rated before its due date, the new interval is shortened by the days gained early, so studying ahead cannot push the schedule out. Turning this off also disables "study ahead": borrowing future cards without that correction would inflate their intervals.',
    'review.answerTime.name': 'Show suggested answer time',
    'review.answerTime.desc': 'Once a card passes its suggested time, review shows how long it has been on screen. The budget is a base plus reading time for the answer, adjusted by the card\'s rating history.',
    'review.answerBase.name': 'Answer time: base seconds',
    'review.answerBase.desc': 'Seconds allowed for a short answer before reading time is added.',
    'review.answerChunk.name': 'Answer time: seconds per 40 characters',
    'review.answerChunk.desc': 'Reading time added for every 40 characters of answer, on top of the base. 0 ignores answer length.',
    'review.answerWeight.name': 'Answer time: rating history weight (%)',
    'review.answerWeight.desc': 'Positive gives cards you keep failing more time (slow recall). Negative nudges them earlier (counters overthinking). 0 ignores rating history.',
    'review.answerImageChars.name': 'Masked picture: characters per full image',
    'review.answerImageChars.desc': 'An occlusion card has no text to measure, so its boxes are read as an area: a completely masked picture counts as this many characters, and the covered share of it is the answer. Each box adds a little on top.',
    'review.keys.desc': 'Pressed in review once the answer is shown. "Space" means the space bar; digits work on the number row and on the numpad. Clear the field to drop that shortcut.',
    'review.keyAgain.name': 'Shortcut: Again',
    'review.keyHard.name': 'Shortcut: Hard',
    'review.keyGood.name': 'Shortcut: Good',
    'review.keyEasy.name': 'Shortcut: Easy',

    'display.heading': 'Card display',
    'display.layout.name': 'Review layout',
    'display.layout.desc': 'Centred: the card sits in a 760px column in the middle of the pane. Full width: the card uses the whole pane and the text starts at the left edge, which suits wide screens and long answers.',
    'display.layout.center': 'Centred column',
    'display.layout.wide': 'Full width',
    'display.maskAll.name': 'Mask all groups on the front',
    'display.maskAll.desc': 'On: every group of a cloze or image card is hidden on the front (the answer side always reveals everything). Off: only the group this card asks is hidden, the other groups stay visible.',
    'display.badge.name': 'Card badge in notes',
    'display.badge.desc': 'Show the 📇 marker next to blocks in a note that already produced cards. Clicking it opens the browse view on that card.',

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
    'maintenance.heading': 'Maintenance',
    'maintenance.sweep.name': 'Editing scratch files',
    'maintenance.sweep.desc': 'Notes created while a card was edited in a split. They are deleted when the split closes; whatever a crash left behind sits in the editing folder.',
    'maintenance.sweep.button': 'Clean up',
    'maintenance.sweep.empty': 'No scratch files to remove.',
    'maintenance.backup.name': 'Backups',
    'maintenance.backup.desc': 'Files written before a destructive action (exam plans, orphan cleanup). Delete them when you no longer need to roll back.',
    'maintenance.backup.button': 'Delete backups',
    'maintenance.backup.confirm': 'Delete every file in the backup folder? This cannot be undone.',
    'maintenance.backup.empty': 'No backup files to remove.',
    'maintenance.reindex.name': 'Card index',
    'maintenance.reindex.desc': 'Read every card file again and repaint the views. Use it after editing the JSON by hand or syncing from another device.',
    'maintenance.reindex.button': 'Rebuild',
    'io.external.name': 'External AI / tools',
    'io.external.desc': 'No model is built in. Any tool can push cards through "obsidian://fakecard?data=<url-encoded JSON>" or the clipboard button below. JSON shape: [{"type":"qa","front":"...","back":"..."},{"type":"cloze","clozeText":"{{c1::...}}"}] - ==highlights== are accepted too.',
    'io.clipboard.name': 'Import cards from the clipboard',
    'io.clipboard.desc': 'Reads JSON from the clipboard.',
    'io.clipboard.button': 'Import',
    'io.apkg.name': 'Import an Anki deck (.apkg)',
    'io.apkg.desc': 'Basic, cloze and image-occlusion notes are converted; review history, decks and tags come along.',
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

    'review.heading': '复习界面',
    'pace.heading': '每日节奏',
    'ahead.heading': '提前复习',
    'review.newPerDay.name': '每天新卡数量',
    'review.newPerDay.desc': '每天引入多少张尚未学过的新卡片；到期卡超过每日上限时会自动暂停。',
    'review.maxPerDay.name': '每天复习上限',
    'review.maxPerDay.desc': '单日复习的基础上限；「今天多学一点」只在本次会话里临时提高它。',
    'review.aheadBatch.name': '每次提前复习的卡片数量',
    'review.aheadBatch.desc': '今日队列清空后，「提前复习」会从未到期的卡里挑这么多张；评分时按提前的天数缩短新间隔。',
    'review.aheadOrder.name': '提前复习的选卡方式',
    'review.aheadOrder.desc': '「提前复习」从未来借卡时的顺序：优先反复出错的，或优先最早到期的。',
    'review.aheadOrder.hardest': '优先最难的（先看错次，再看 FSRS 难度）',
    'review.aheadOrder.earliest': '优先最早到期的',
    'review.pauseNew.name': '积压时暂停新卡',
    'review.pauseNew.desc': '今天到期的卡已经超过每日上限时，先不放新卡，等队列降下来再恢复。这不改动任何排程：新卡只是晚点开始，已学卡片的 FSRS 状态不受影响。',
    'review.boostStep.name': '「今天多学一点」每次加多少张',
    'review.boostStep.desc': '点一次「今天多学一点」临时增加的复习额度。留空表示自动：每日上限的十分之一，最少 10 张。',
    'review.boostStep.auto': '自动',
    'review.scaleEarly.name': '提前复习时折算间隔',
    'review.scaleEarly.desc': '卡片未到期就评分时，按提前的天数缩短新间隔，避免提前复习把复习计划推远。关掉后「提前复习」也会一并停用——不给提前复习的评分做折算，会把这些卡的间隔虚高。',
    'review.answerTime.name': '显示建议作答时间',
    'review.answerTime.desc': '卡片超过预估用时后，复习界面会显示它已经在屏幕上停留了多久。预估由基础时间加上答案的阅读时间，再按这张卡的评分历史调整。',
    'review.answerBase.name': '作答时间：基础秒数',
    'review.answerBase.desc': '加上阅读时间之前，简短回答可用的秒数。',
    'review.answerChunk.name': '作答时间：每 40 字增加的秒数',
    'review.answerChunk.desc': '在基础时间之上，答案每 40 个字符追加的阅读时间。设为 0 表示完全不考虑答案长度。',
    'review.answerWeight.name': '作答时间：评分历史权重（%）',
    'review.answerWeight.desc': '正数给反复失败的卡片更多时间（慢慢回忆）。负数让这类卡片更早提示（避免过度纠结）。0 表示不考虑历史。',
    'review.answerImageChars.name': '图片遮挡：整张图折合多少字',
    'review.answerImageChars.desc': '图片遮挡卡没有文字可量，于是把遮罩当面积读：整张图完全被遮住时折合这么多字，实际只按被遮住的比例计算；每个遮罩再额外记一点。',
    'review.keys.desc': '显示答案后按这个键评分。"Space" 表示空格键；数字键在字母区上方和小键盘上都有效。清空输入框即可取消这个快捷键。',
    'review.keyAgain.name': 'Again 快捷键',
    'review.keyHard.name': 'Hard 快捷键',
    'review.keyGood.name': 'Good 快捷键',
    'review.keyEasy.name': 'Easy 快捷键',

    'display.heading': '卡片显示',
    'display.layout.name': '复习界面布局',
    'display.layout.desc': '居中：卡片在窗格中间收成 760px 宽的一栏。铺满：卡片用满整个窗格，文字从左侧开始排，宽屏和长答案更适合。',
    'display.layout.center': '居中一栏',
    'display.layout.wide': '铺满窗格',
    'display.maskAll.name': '正面遮住所有分组',
    'display.maskAll.desc': '开：填空题或图片卡的正面遮住所有分组（答案面始终全部显示）。关：只遮住本卡片所问的分组，其他分组保持可见。',
    'display.badge.name': '笔记里的卡片角标',
    'display.badge.desc': '在已经生成过卡片的笔记段落旁显示 📇 角标，点它会在浏览视图里定位到那张卡。',

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
    'maintenance.heading': '维护',
    'maintenance.sweep.name': '编辑临时文件',
    'maintenance.sweep.desc': '在分栏里编辑卡片时生成的笔记，关闭分栏即删除。崩溃残留的会留在 editing 目录里。',
    'maintenance.sweep.button': '立即清理',
    'maintenance.sweep.empty': '没有需要清理的临时文件。',
    'maintenance.backup.name': '备份文件',
    'maintenance.backup.desc': '执行破坏性操作前（考试计划、清理孤儿卡）写下的备份。确认不再需要回滚时可以删除。',
    'maintenance.backup.button': '删除备份',
    'maintenance.backup.confirm': '删除 backup 目录里的全部备份文件？此操作不可撤销。',
    'maintenance.backup.empty': '没有需要删除的备份文件。',
    'maintenance.reindex.name': '卡片索引',
    'maintenance.reindex.desc': '重新读取所有卡片文件并刷新各个视图。手工改过 JSON 或从其它设备同步后可以用它。',
    'maintenance.reindex.button': '重建',
    'io.external.name': '外部 AI / 工具',
    'io.external.desc': '插件不内置任何模型。任何工具都可以通过 "obsidian://fakecard?data=<url-encoded JSON>" 或下面的剪贴板按钮推送卡片。JSON 结构：[{"type":"qa","front":"...","back":"..."},{"type":"cloze","clozeText":"{{c1::...}}"}] - 也接受 ==高亮==。',
    'io.clipboard.name': '从剪贴板导入卡片',
    'io.clipboard.desc': '从剪贴板读取 JSON。',
    'io.clipboard.button': '导入',
    'io.apkg.name': '导入 Anki 牌组（.apkg）',
    'io.apkg.desc': '会转换基础卡、填空卡和图片遮挡笔记，复习历史、牌组和标签一起导入。',
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

/**
 * Strings keyed by their English text. Used for the labels that live next to
 * the DOM they belong to; a missing entry falls back to the English text, so a
 * new string never breaks the UI - add the Chinese line here to translate it.
 */
const UI_ZH: Record<string, string> = {
    // Shared labels.
    'Loading…': '加载中…',
    'Cancel': '取消',
    'Continue': '继续',
    'Delete': '删除',
    'Create cards': '创建卡片',
    'Create card': '创建卡片',
    'Save changes': '保存修改',
    'New card': '新建卡片',
    'Deck': '牌组',
    'Tags': '标签',
    'Front': '正面',
    'Back': '背面',
    'Type': '类型',
    'Reviews': '复习次数',
    'Q&A': '问答',
    'Cloze': '填空',
    'Image': '图片',
    'Image occlusion': '图片遮挡',
    'New': '新卡',
    'Learning': '学习中',
    'Reviewing': '复习中',
    'Relearning': '重学中',
    'Paused': '已暂停',
    'Graduated': '已毕业',
    'paused': '已暂停',
    'graduated': '已毕业',
    'child': '子卡',

    // Review view.
    'No cards yet': '还没有卡片',
    'Generate cards from a note or create one manually first.': '先从笔记生成卡片，或手动新建一张。',
    'All decks': '全部牌组',
    'Open the note this card came from': '打开这张卡片的来源笔记',
    'Pause this card and study it through a simpler stand-in': '暂停这张卡，先用更简单的替代卡学习',
    'Edit this card': '编辑这张卡片',
    'Show answer': '显示答案',
    'Space': '空格',
    'Again': '重来',
    'Hard': '困难',
    'Good': '良好',
    'Easy': '简单',
    'This card keeps failing - build a child card now': '这张卡反复出错 - 现在就建一张子卡',
    'Q&A child card': '问答子卡',
    'Cloze child card': '填空子卡',
    'Image occlusion child card': '图片遮挡子卡',
    'Child card created - parent paused.': '子卡已创建 - 原卡已暂停。',
    'Nothing to undo.': '没有可撤销的操作。',
    'Rating undone.': '已撤销评分。',
    'Review finished': '复习完成',
    'Review again': '再复习一轮',
    'Reloaded.': '已重新加载。',
    'Study more today ({count} left)': '今天多学一点（还剩 {count} 张）',
    'Study {count} cards ahead': '提前复习 {count} 张',
    'Refresh': '刷新',
    'studying ahead': '提前复习中',
    '{count} more due': '{count} 张待复习',
    'These cards are due today; the daily limit kept them out of this session.':
        '这些卡今天就到期了，只是被每日上限挡在了本轮之外。',
    '{count} due card(s) are waiting behind the daily limit.': '{count} 张到期卡还在每日上限后面等着。',
    'Today still has {count} due card(s) the daily limit cut off. Each press allows {step} more; they are due today, so intervals are not scaled.':
        '今天还有 {count} 张到期卡被每日上限挡住。每点一次可以多学 {step} 张——它们本来就该今天复习，间隔不会折算。',
    'Today is clear. These cards are not due yet; because they are early, a rating shortens the new interval by the days you gained early.':
        '今天已经清空。这些卡还没到期；因为提前了，评分后会按提前的天数把新间隔缩短。',
    'Recompute today\'s queue. Only needed after adding or editing cards during the session.':
        '重新计算今天的队列。只有复习途中新增或修改过卡片时才用得到。',
    'No card to study ahead.': '暂时没有可以提前复习的卡。',
    'Nothing else is due today.': '今天没有更多到期卡片了。',
    'Refreshed - {count} due card(s) are waiting.': '已刷新 · 还有 {count} 张待复习',
    'Refreshed - nothing else is due today.': '已刷新 · 今天已清空',
    'Pause': '暂停',
    'Resume': '恢复',
    'Pause selected': '暂停所选',
    'Resume selected': '恢复所选',
    '{count} card(s) paused.': '已暂停 {count} 张卡片。',
    '{count} card(s) resumed.': '已恢复 {count} 张卡片。',
    'Parent card': '父卡',
    'Open the paused parent card': '打开已暂停的父卡',
    'Open the parent card': '打开父卡',
    '(empty)': '（空）',
    'not found': '未找到',
    'Study this card now': '现在就学这张卡',
    'Edit the masks on this picture': '编辑这张图的蒙版',
    '✎ Edit masks': '✎ 编辑蒙版',
    'Ctrl+wheel to zoom, double-click to fit': 'Ctrl+滚轮缩放，双击还原',
    'Study ahead is off: turn on interval scaling in Settings to use it.':
        '提前复习已关闭：在设置里打开「提前复习时折算间隔」后可用。',
    'Removed {count} scratch file(s).': '已清理 {count} 个临时文件。',
    'Removed {count} backup file(s).': '已删除 {count} 个备份文件。',
    'Card index rebuilt.': '卡片索引已重建。',
    'The exam day has passed - that plan was removed and its cards are back on the long-term schedule.':
        '考试日期已过，该计划已移除，卡片回到长期排程。',
    "Based on answer length and this card's rating history": '根据答案长度和这张卡的评分历史估算',
    'Suggested {budget} - based on answer length and this card\'s rating history':
        '建议用时 {budget}——按答案长度和这张卡的评分历史估算',
    'Restart the timer': '重新计时',
    '{count} card(s) in the library.': '库中共 {count} 张卡片。',
    'Review': '复习',
    'Card {n} of {total}': '第 {n} / {total} 张',
    'Today: {due} due, {new} new, {learning} learning. Click to review.':
        '今日队列：到期 {due} 张，新卡 {new} 张，学习中 {learning} 张。点击打开复习界面。',
    'today': '今天',
    '{days}d': '{days} 天',
    '{name}: exam today': '{name}：今天考试',
    '{name}: days until the exam': '{name}：距考试天数',
    '{count} exam plans have passed and were removed. Their cards are back on the long-term schedule.':
        '{count} 个考试计划已过期并被移除，卡片回到长期排程。',

    // Browse view.
    'Browse': '浏览',
    'All': '全部',
    'Due': '到期',
    'Child': '子卡',
    'Orphan': '孤儿',
    'Cards moved.': '卡片已移动。',
    'Search… (deck:deckname tag:tag is:due is:child -tag:x prop:due<7)': '搜索…（deck:牌组名 tag:标签 is:due is:child -tag:x prop:due<7）',
    '{count} selected': '已选 {count} 张',
    'Move to…': '移动到…',
    'Delete selected': '删除所选',
    'Delete {count} card(s)?': '删除 {count} 张卡片？',
    'Cards deleted.': '卡片已删除。',
    'No card matches.': '没有匹配的卡片。',
    'Select a card to preview it.': '选择一张卡片进行预览。',
    '👁 Preview': '👁 预览',
    '↗ Source': '↗ 来源',
    '✎ Edit question': '✎ 编辑题目',
    '✎ Edit answer': '✎ 编辑答案',
    '✎ Edit cloze text': '✎ 编辑填空正文',

    '🗑 Delete': '🗑 删除',
    'Delete this card?': '删除这张卡片？',
    'Card deleted.': '卡片已删除。',

    // Card preview and source jump.
    '↗ Edit in editor': '↗ 在编辑器里编辑',
    'Edit the text in the editor': '在 Obsidian 编辑器里编辑这段文字',
    'Could not open the editor: {message}': '无法打开编辑器：{message}',
    'Preview': '预览',
    'Card preview': '卡片预览',
    'Source: {path}': '来源：{path}',
    '↗ Open at source': '↗ 在原文打开',
    'Could not locate the source block - the note may have been edited. Opening the note instead.':
        '找不到来源块 - 笔记可能已被修改，改为打开整篇笔记。',

    // Child card prompt.
    'Build a child card?': '新建一张子卡？',
    'A child card pauses this card and replaces it while you study a simpler version you write yourself - a smaller question, a shorter cloze. When every child card graduates, this card comes back on its normal schedule.':
        '子卡会暂停这张卡片，在你学习自己写的更简单版本（更小的问题、更短的填空）期间替代它。所有子卡毕业后，这张卡会按正常排程恢复。',
    'It is meant for cards that keep failing. This one has not reached the threshold yet, so the button is not highlighted.':
        '它用于反复出错的卡片。这张卡还没达到阈值，所以按钮没有高亮。',
    'Recent failing score: {score} / {target}': '最近的失败分：{score} / {target}',
    'Each Hard or Again raises the score, any Good or Easy resets it. You can lower the threshold in Settings.':
        '每次 Hard 或 Again 都会提高分数，任意 Good 或 Easy 会清零。可在设置中降低阈值。',

    // Statistics view.
    'Statistics': '统计',
    'Reviewed today': '今日复习',
    'New today': '今日新卡',
    'Accuracy today': '今日正确率',
    'Time today': '今日用时',
    '{count} min': '{count} 分钟',
    'Streak': '连续天数',
    '{count} day(s)': '{count} 天',
    'All cards': '全部卡片',
    'Ratings, last 30 days': '评分分布（近 30 天）',
    'True retention, last 30 days': '真实留存率（近 30 天）',
    '{percent}%  ({passed} / {total} reviews rated Hard, Good or Easy)':
        '{percent}%（{total} 次评分中 {passed} 次为 Hard、Good 或 Easy）',
    'Card states': '卡片状态',
    'Maturity': '成熟度',
    'Young (< 21 days)': '年轻（< 21 天）',
    'Mature (≥ 21 days)': '成熟（≥ 21 天）',
    'Review heatmap': '复习热力图',
    'Earlier days': '更早',
    'Later days': '更近',
    'Reviews, last 30 days': '复习量（近 30 天）',
    'Due forecast, next 30 days': '到期预测（未来 30 天）',
    'Average {average}/day · Peak {peak} ({peakDay}) · {busy} day(s) above 2x average':
        '平均每天 {average} 张 · 峰值 {peak} 张（{peakDay}）· 有 {busy} 天超过平均值的 2 倍',
    'Hardest cards': '最难的卡片',
    'No struggling cards yet.': '还没有反复出错的卡片。',
    '{count} miss(es)': '错 {count} 次',

    // Q&A panel.
    'Edit Q&A card': '编辑问答卡',
    'New Q&A card': '新建问答卡',
    'Question': '问题',
    'Answer': '答案',
    'tag1, tag2': '标签1, 标签2',
    'Both the question and the answer are required.': '问题和答案都不能为空。',
    'Card saved.': '卡片已保存。',

    // Cloze panel.
    'Edit cloze card': '编辑填空卡',
    'New cloze card': '新建填空卡',
    'Anki cloze format: {{c1::answer}} hides "answer" in group 1. Append ::note to show a note while hidden, e.g. {{c1::answer::dose}}. Select text and press "Wrap" to create a hole; use "New group" to create c2, c3 ...':
        'Anki 填空格式：{{c1::答案}} 会把「答案」藏在第 1 组。在后面加 ::注释 可在挖空时显示提示，例如 {{c1::答案::剂量}}。选中文字后按「包裹」即可挖空；用「新建分组」可创建 c2、c3 ……',
    'Wrap selection': '包裹选中',
    'Remove cloze': '移除挖空',
    'Select some text first.': '请先选中一些文字。',
    'The card body is empty.': '卡片正文为空。',
    'No hole found - wrap some text in {{c1::...}} first.': '没有找到挖空 - 请先用 {{c1::...}} 包裹文字。',
    'No cloze hole at the cursor.': '光标处没有挖空。',
    'Cloze text': '填空正文',
    'matched in the answer: {text}': '命中在答案：{text}',
    'Hide answer': '收起答案',
    // Search box: the picker menu and the completion hints.
    'Insert a search filter': '插入搜索条件',
    'Any text': '任意文字',
    'Question only': '仅题目',
    'Answer only': '仅答案',
    'New cards': '新卡',
    'Due today': '今天到期',
    'Child cards': '子卡',
    'Orphans': '孤儿卡',
    'Type: Q&A': '类型：问答',
    'Type: cloze': '类型：填空',
    'Type: image': '类型：图片',
    'Due within 7 days': '7 天内到期',
    'Overdue': '已过期',
    'Interval at least 21 days': '间隔 ≥ 21 天',
    'Difficulty at least 7': '难度 ≥ 7',
    'Added in the last 7 days': '最近 7 天新建',
    'State': '状态',
    'Tag': '标签',
    'due, interval, difficulty …': '到期、间隔、难度…',
    'created in the last N days': '最近 N 天新建',
    'reviewed in the last N days': '最近 N 天复习过',
    'comparison': '比较符',
    'never reviewed': '从未复习',
    'ready today': '今天到期',
    'in its first steps': '学习步骤中',
    'on the long schedule': '长期排程',
    'failed and back in steps': '重学中',
    'a stand-in card': '替身子卡',
    'kept out of the queue': '已移出队列',
    'finished stand-in': '已毕业的子卡',
    'source note is gone': '源笔记已删除',
    'question and answer': '问答',
    'cloze': '填空',
    'image occlusion': '图片遮挡',
    'days until due': '距到期天数',
    'interval in days': '间隔（天）',
    'FSRS difficulty 1-10': 'FSRS 难度 1–10',
    'reviews so far': '累计复习次数',
    'times forgotten': '遗忘次数',


    // Image panel.
    'Edit image card': '编辑图片卡',
    'New image card': '新建图片卡',
    'New group': '新建分组',
    'Drag on the image to add a box. Click a box to select it and drag to move it; Ctrl+click selects several; drag a grip on a selected box to resize it. Pick a group (c1, c2 ...) first; each group is asked separately during review.':
        '在图片上拖动即可添加选框。点击选框选中它、拖动即可移动；Ctrl+点击可多选；选中后拖动边角的小方块即可调整大小。先选一个分组（c1、c2……），每个分组在复习时单独提问。',
    'Move selected to c{group}': '把选中的框移到 c{group}',
    'Select a box first, then remove it.': '先选中至少一个选框。',
    'Shape: Rect': '形状：矩形',
    'Shape: Ellipse': '形状：椭圆',
    'Remove selected': '删除所选',
    'Paste an image (Ctrl/Cmd+V), drop a file here, or choose one from disk. It is copied into the library folder.':
        '粘贴图片（Ctrl/Cmd+V）、把文件拖到这里，或从磁盘选择。图片会复制到卡片库文件夹。',
    'Paste from clipboard': '从剪贴板粘贴',
    'Choose an image first.': '请先选择一张图片。',
    'No image on the clipboard - press Ctrl/Cmd+V or choose a file.':
        '剪贴板里没有图片 - 按 Ctrl/Cmd+V 或选择一个文件。',
    'Could not import that image.': '无法导入那张图片。',
    'Draw at least one rectangle first.': '请先画至少一个矩形。',
    'Saved {count} image card(s).': '已保存 {count} 张图片卡。',

    // New card menus and generated-card preview.
    'Pick a card type. The manual panel opens next.': '选择卡片类型，随后会打开手动编辑面板。',
    'Question on the front, answer on the back.': '正面问题，背面答案。',
    'Anki {{c1::...}} holes, one or more groups.': 'Anki 风格的 {{c1::...}} 挖空，可有一个或多个分组。',
    'Draw mask groups on an image (from the clipboard, or right-click any image).':
        '在图片上画遮挡分组（可粘贴剪贴板图片，或右键任意图片）。',
    'Preview {count} card(s)': '预览 {count} 张卡片',
    'Created {count} card(s).': '已创建 {count} 张卡片。',

    // Import and export.
    'The clipboard is empty.': '剪贴板为空。',
    'Imported {count} card(s).': '已导入 {count} 张卡片。',
    'Card library: {path}': '卡片库：{path}',
    'Could not read the clipboard.': '无法读取剪贴板。',
    'Reading Anki deck…': '正在读取 Anki 牌组…',
    'Anki import failed: {error}': 'Anki 导入失败：{error}',
    'Imported {qa} Q&A, {cloze} cloze and {image} image card(s), updated {updated}, skipped {skipped}.':
        '已导入 {qa} 张问答、{cloze} 张填空、{image} 张图片卡，更新 {updated} 张，跳过 {skipped} 张。',
    'This deck is already in the library': '这个牌组已经在库里了',
    '{duplicates} card(s) match cards that are already here, {withHistory} of them with an Anki schedule. Using the Anki schedule replaces their current progress here; the card text is never changed.':
        '{duplicates} 张卡与库中已有卡片内容相同，其中 {withHistory} 张带 Anki 的复习记录。使用 Anki 记录会覆盖这些卡在 fakecard 里当前的进度，卡片内容不会改动。',
    'Use the Anki schedule': '使用 Anki 记录',
    'Keep the current schedule': '保留当前进度',
    'Exported {count} card(s) to {path}': '已导出 {count} 张卡片到 {path}',

    // Maintenance.
    'No orphan cards.': '没有孤儿卡片。',
    'Removed {count} orphan card(s). Backup: {path}': '已删除 {count} 张孤儿卡片。备份：{path}',
    'No graduated child cards.': '没有已毕业的子卡片。',
    'Removed {count} graduated child card(s). Backup: {path}': '已删除 {count} 张已毕业子卡片。备份：{path}',

    // Exam plan.
    'No reviewed cards in: {decks}.': '这些牌组里还没有复习过的卡片：{decks}。',
    'No reviewed cards to plan yet.': '还没有可排的复习卡片。',
    'Every selected card is already due before the exam.': '所选卡片都在考试前到期，无需调整。',
    '{name}: {selected}/{eligible} card(s) selected, {moved} moved to ~{perDay}/day over {days} days. Backup: {path}':
        '{name}：选中 {selected}/{eligible} 张，{moved} 张调整到考前 {days} 天内每天约 {perDay} 张。备份：{path}',
    'Warning: {count} cards over {days} days is more than {cap}/day. Lower the share, or raise the daily review limit.':
        '警告：{days} 天内排 {count} 张，超过每天 {cap} 张。请降低比例，或提高每日复习上限。',
    'Add an exam plan first (Settings -> FakeCard -> Exam plan).': '请先添加考试计划（设置 -> FakeCard -> 考试计划）。',

    // Commands, ribbon and editor menu.
    'Generate Q&A cards from the whole note': '从整篇笔记生成问答卡',
    'Generate cloze cards from the whole note': '从整篇笔记生成填空卡',
    'Generate cards from the selected lines': '从选中行生成卡片',
    'fakecard: statistics': 'fakecard：统计',
    'Start reviewing': '开始复习',
    'Browse and edit cards': '浏览和编辑卡片',
    'New image occlusion card (from clipboard)': '新建图片遮挡卡（从剪贴板）',
    'Make occlusion card from the image at the cursor': '用光标处的图片创建遮挡卡',
    'Open statistics': '打开统计',
    'New card (manual)': '新建卡片（手动）',
    'Import cards from clipboard (JSON)': '从剪贴板导入卡片（JSON）',
    'Import cards from Anki (.apkg)': '从 Anki 导入牌组（.apkg）',
    'Export all cards (JSON)': '导出全部卡片（JSON）',
    'Clean up orphan cards (source note deleted)': '清理孤儿卡（来源笔记已删除）',
    'Remove graduated child cards': '删除已毕业的子卡片',
    'Build an exam plan (spread cards until the exam)': '生成考试计划（把卡片铺到考前）',
    'Open the card library folder': '打开卡片库文件夹',
    'fakecard: new Q&A card from selection': 'fakecard：用选中内容新建问答卡',
    'fakecard: new cloze card from selection': 'fakecard：用选中内容新建填空卡',
    'fakecard: generate Q&A cards': 'fakecard：生成问答卡',
    'fakecard: generate cloze cards': 'fakecard：生成填空卡',
    'fakecard: new card': 'fakecard：新建卡片',

    // Editor and URI notices.
    'Open a note first.': '请先打开一篇笔记。',
    'No image on this line. Put the cursor on an ![[image]] line, or select the image embed.':
        '这一行没有图片。请把光标放在 ![[图片]] 所在行，或选中图片嵌入。',
    'Put an image on the clipboard first, or right-click an image in a note.':
        '请先把图片复制到剪贴板，或在笔记中右键点击图片。',
    'fakecard: missing "data" parameter.': 'fakecard：缺少 "data" 参数。',
    'fakecard: the data is not valid card JSON.': 'fakecard：数据不是有效的卡片 JSON。',
};

/** Translate a UI label written in English in the source. */
export function tt(text: string): string {
    return detectLang() === 'zh' ? UI_ZH[text] ?? text : text;
}

/** Same as `tt`, with `{name}` placeholders filled in. */
export function ttf(text: string, vars: Record<string, string | number>): string {
    return tt(text).replace(/\{(\w+)\}/g, (match, name: string) => (
        name in vars ? String(vars[name]) : match
    ));
}
