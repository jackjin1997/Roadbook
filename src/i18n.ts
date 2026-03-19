export interface UIStrings {
  // Home
  myJourneys: string;
  newJourney: string;
  creating: string;
  createFirst: string;
  homeTagline: string;
  sources: string;
  roadmaps: string;
  deleteJourney: string;

  // Workspace header
  back: string;

  // Sources panel
  addSource: string;
  noSourcesYet: string;
  addSourceToStart: string;
  pasteHint: string;
  adding: string;
  cancel: string;

  // Roadmap panel
  generated: string;
  regenerate: string;
  regenerating: string;
  weavingRoadmap: string;
  readyToGenerate: string;
  generateRoadmap: string;

  // Source item
  roadmapReady: string;
  generateSourceRoadmap: string;

  // Confirm dialog
  confirmDeleteTitle: string;
  confirmDeleteWorkspace: string;
  confirmDeleteSource: string;

  // Toast
  deleted: string;
  deleteFailed: string;
  sourceAdded: string;
  sourceAddFailed: string;
  generationComplete: string;
  generationFailed: string;
  renameFailed: string;
  chatSendFailed: string;
  digestComplete: string;
  researchComplete: string;
  serverUnreachable: string;
  retry: string;

  // Journey empty state
  noJourneyYet: string;
  journeyHint: string;

  loading: string;

  // Generation progress
  stageParseInput: string;
  stageExtractSkillTree: string;
  stageMergeSkillTrees: string;
  stageResearchSkills: string;
  stageGenerateRoadbook: string;

  // Empty states
  chatEmptyTitle: string;
  chatEmptyHint: string;
  chatSuggestion1: string;
  chatSuggestion2: string;
  chatSuggestion3: string;
  insightsEmptyTitle: string;
  insightsEmptyHint: string;
  researchEmptyTitle: string;
  researchEmptyHint: string;
  skillRadarEmptyTitle: string;
  skillRadarEmptyHint: string;
  skillRadarEmptyAction: string;

  // Onboarding
  onboardingStep1: string;
  onboardingStep2: string;
  onboardingStep3: string;
  onboardingTitle: string;

  // JD Match
  jdMatchNav: string;
  jdMatchTitle: string;
  jdMatchInputLabel: string;
  jdMatchPlaceholder: string;
  jdMatchButton: string;
  jdMatchAnalyzing: string;
  jdMatchScoreLabel: string;
  jdMatchMastered: string;
  jdMatchLearning: string;
  jdMatchMissing: string;

  // Timeline
  timelineNav: string;
  timelineTitle: string;
  timelineFilterPlaceholder: string;
  timelineEmpty: string;
  timelineNoResults: string;
}

const strings: Record<string, UIStrings> = {
  "English": {
    myJourneys: "My Journeys",
    newJourney: "+ New Journey",
    creating: "Creating...",
    createFirst: "Create your first journey",
    homeTagline: "Turn any JD, article, or concept into a structured learning roadbook.",
    sources: "Sources",
    roadmaps: "roadbook",
    deleteJourney: "Delete journey",
    back: "← Back",
    addSource: "+ Add source",
    noSourcesYet: "No sources yet",
    addSourceToStart: "Add a source to generate your first roadbook",
    pasteHint: "Paste a JD, article, or concept...",
    adding: "Adding...",
    cancel: "Cancel",
    generated: "Generated",
    regenerate: "Regenerate",
    regenerating: "Regenerating...",
    weavingRoadmap: "Ariadne is weaving your roadbook...",
    readyToGenerate: "Source added. Ready to generate your roadbook.",
    generateRoadmap: "Generate Roadbook",
    roadmapReady: "✓ Ready",
    generateSourceRoadmap: "Generate",
    confirmDeleteTitle: "Confirm delete",
    confirmDeleteWorkspace: "This journey and all its sources will be permanently deleted.",
    confirmDeleteSource: "This source and its roadbook will be permanently deleted.",
    deleted: "Deleted",
    deleteFailed: "Delete failed",
    sourceAdded: "Source added",
    sourceAddFailed: "Failed to add source",
    generationComplete: "Roadbook generated",
    generationFailed: "Generation failed",
    renameFailed: "Rename failed",
    chatSendFailed: "Failed to send message",
    digestComplete: "Digest complete",
    researchComplete: "Research complete — source added",
    serverUnreachable: "Cannot connect to server",
    retry: "Retry",
    noJourneyYet: "No Journey Roadmap yet.",
    journeyHint: "Merge multiple sources into a comprehensive learning roadmap. Select sources in the left panel and click Generate Journey.",
    loading: "Loading...",
    stageParseInput: "Analyzing input",
    stageExtractSkillTree: "Extracting skills",
    stageMergeSkillTrees: "Merging skills",
    stageResearchSkills: "Researching resources",
    stageGenerateRoadbook: "Generating roadbook",
    chatEmptyTitle: "Ask anything about your sources",
    chatEmptyHint: "Ariadne can answer questions, explain concepts, or update your roadbook.",
    chatSuggestion1: "What should I learn first?",
    chatSuggestion2: "Explain the key concepts",
    chatSuggestion3: "What are the prerequisites?",
    insightsEmptyTitle: "Capture ideas as you explore",
    insightsEmptyHint: "Save observations, questions, and aha moments here.",
    researchEmptyTitle: "Deep-dive into topics",
    researchEmptyHint: "Add research questions and Ariadne will investigate them for you.",
    skillRadarEmptyTitle: "Your skill radar is empty",
    skillRadarEmptyHint: "Generate roadbooks in your workspaces to see skills here.",
    skillRadarEmptyAction: "Go to workspaces",
    onboardingStep1: "Add a source",
    onboardingStep2: "Generate a skill graph",
    onboardingStep3: "Explore & learn",
    onboardingTitle: "Get started in 3 steps",
    jdMatchNav: "JD Match",
    jdMatchTitle: "JD Match",
    jdMatchInputLabel: "Paste a job description",
    jdMatchPlaceholder: "Paste the full job description here...",
    jdMatchButton: "Match Skills",
    jdMatchAnalyzing: "Analyzing...",
    jdMatchScoreLabel: "Match Score",
    jdMatchMastered: "Mastered",
    jdMatchLearning: "Learning",
    jdMatchMissing: "Missing",
    timelineNav: "Timeline",
    timelineTitle: "Skill Timeline",
    timelineFilterPlaceholder: "Filter by skill name...",
    timelineEmpty: "No skill events yet. Update skill progress in your workspaces to see events here.",
    timelineNoResults: "No events match your filter.",
  },
  "Chinese (Simplified)": {
    myJourneys: "我的旅程",
    newJourney: "+ 新建旅程",
    creating: "创建中...",
    createFirst: "开启你的第一段旅程",
    homeTagline: "每段旅程，皆有源起。",
    sources: "Source",
    roadmaps: "路书",
    deleteJourney: "删除旅程",
    back: "← 返回",
    addSource: "+ 添加 Source",
    noSourcesYet: "暂无 Source",
    addSourceToStart: "添加一条 Source，生成你的第一份路书",
    pasteHint: "粘贴 JD、技术文章或输入技术概念...",
    adding: "添加中...",
    cancel: "取消",
    generated: "生成于",
    regenerate: "重新生成",
    regenerating: "生成中...",
    weavingRoadmap: "Ariadne 正在为你编织路书...",
    readyToGenerate: "Source 已添加，点击生成路书。",
    generateRoadmap: "生成路书",
    roadmapReady: "✓ 已就绪",
    generateSourceRoadmap: "生成路书",
    confirmDeleteTitle: "确认删除",
    confirmDeleteWorkspace: "该旅程及其所有 Source 将被永久删除。",
    confirmDeleteSource: "该 Source 及其路书将被永久删除。",
    deleted: "已删除",
    deleteFailed: "删除失败",
    sourceAdded: "Source 已添加",
    sourceAddFailed: "添加 Source 失败",
    generationComplete: "路书已生成",
    generationFailed: "生成失败",
    renameFailed: "重命名失败",
    chatSendFailed: "消息发送失败",
    digestComplete: "Digest 完成",
    researchComplete: "研究完成 — Source 已添加",
    serverUnreachable: "无法连接服务器",
    retry: "重试",
    noJourneyYet: "尚无 Journey 路书",
    journeyHint: "从多个 Source 合并生成综合学习路线。在左侧选择 Source 后点击 Generate Journey。",
    loading: "加载中...",
    stageParseInput: "分析输入",
    stageExtractSkillTree: "提取技能树",
    stageMergeSkillTrees: "合并技能树",
    stageResearchSkills: "搜索资源",
    stageGenerateRoadbook: "生成路书",
    chatEmptyTitle: "关于你的 Source，问我任何问题",
    chatEmptyHint: "Ariadne 可以回答问题、解释概念或更新你的路书。",
    chatSuggestion1: "我应该先学什么？",
    chatSuggestion2: "解释核心概念",
    chatSuggestion3: "有哪些前置知识？",
    insightsEmptyTitle: "探索时记录灵感",
    insightsEmptyHint: "保存你的观察、问题和顿悟时刻。",
    researchEmptyTitle: "深入研究某个主题",
    researchEmptyHint: "添加研究问题，Ariadne 会帮你调查。",
    skillRadarEmptyTitle: "技能雷达暂无数据",
    skillRadarEmptyHint: "在工作区生成路书后，技能将显示在这里。",
    skillRadarEmptyAction: "前往工作区",
    onboardingStep1: "添加一条 Source",
    onboardingStep2: "生成技能图谱",
    onboardingStep3: "探索与学习",
    onboardingTitle: "三步开始",
    jdMatchNav: "JD 匹配",
    jdMatchTitle: "JD 匹配",
    jdMatchInputLabel: "粘贴职位描述",
    jdMatchPlaceholder: "在此粘贴完整的职位描述...",
    jdMatchButton: "匹配技能",
    jdMatchAnalyzing: "分析中...",
    jdMatchScoreLabel: "匹配分数",
    jdMatchMastered: "已掌握",
    jdMatchLearning: "学习中",
    jdMatchMissing: "待学习",
    timelineNav: "时间线",
    timelineTitle: "技能时间线",
    timelineFilterPlaceholder: "按技能名称筛选...",
    timelineEmpty: "暂无技能事件。在工作区更新技能进度后，事件将显示在这里。",
    timelineNoResults: "没有匹配的事件。",
  },
  "Japanese": {
    myJourneys: "マイジャーニー",
    newJourney: "+ 新規作成",
    creating: "作成中...",
    createFirst: "最初のジャーニーを作成",
    homeTagline: "JD・記事・概念から構造化された学習ロードマップを生成します。",
    sources: "ソース",
    roadmaps: "ロードマップ",
    deleteJourney: "ジャーニーを削除",
    back: "← 戻る",
    addSource: "+ 追加",
    noSourcesYet: "ソースがありません",
    addSourceToStart: "ソースを追加してロードマップを生成してください",
    pasteHint: "JD・技術記事・概念を貼り付けてください...",
    adding: "追加中...",
    cancel: "キャンセル",
    generated: "生成日時",
    regenerate: "再生成",
    regenerating: "生成中...",
    weavingRoadmap: "Ariadne がロードブックを作成中...",
    readyToGenerate: "ソースが追加されました。ロードブックを生成してください。",
    generateRoadmap: "ロードブックを生成",
    roadmapReady: "✓ 完成",
    generateSourceRoadmap: "生成",
    confirmDeleteTitle: "削除の確認",
    confirmDeleteWorkspace: "このジャーニーとすべてのソースが完全に削除されます。",
    confirmDeleteSource: "このソースとロードブックが完全に削除されます。",
    deleted: "削除しました",
    deleteFailed: "削除に失敗しました",
    sourceAdded: "ソースを追加しました",
    sourceAddFailed: "ソースの追加に失敗しました",
    generationComplete: "ロードブックを生成しました",
    generationFailed: "生成に失敗しました",
    renameFailed: "名前の変更に失敗しました",
    chatSendFailed: "メッセージの送信に失敗しました",
    digestComplete: "ダイジェスト完了",
    researchComplete: "調査完了 — ソースを追加しました",
    serverUnreachable: "サーバーに接続できません",
    retry: "再試行",
    noJourneyYet: "ジャーニーロードマップはまだありません。",
    journeyHint: "複数のソースを統合して総合的な学習ロードマップを生成します。左のパネルでソースを選択し、Generate Journeyをクリックしてください。",
    loading: "読み込み中...",
    stageParseInput: "入力を分析中",
    stageExtractSkillTree: "スキルを抽出中",
    stageMergeSkillTrees: "スキルを統合中",
    stageResearchSkills: "リソースを検索中",
    stageGenerateRoadbook: "ロードブックを生成中",
    chatEmptyTitle: "ソースについて何でも聞いてください",
    chatEmptyHint: "Ariadneが質問に答え、概念を説明し、ロードブックを更新します。",
    chatSuggestion1: "最初に何を学ぶべき？",
    chatSuggestion2: "キーコンセプトを説明して",
    chatSuggestion3: "前提知識は何？",
    insightsEmptyTitle: "探索しながらアイデアを記録",
    insightsEmptyHint: "気づき、質問、ひらめきをここに保存しましょう。",
    researchEmptyTitle: "トピックを深掘り",
    researchEmptyHint: "調査したい質問を追加すると、Ariadneが調べます。",
    skillRadarEmptyTitle: "スキルレーダーは空です",
    skillRadarEmptyHint: "ワークスペースでロードブックを生成するとスキルが表示されます。",
    skillRadarEmptyAction: "ワークスペースへ",
    onboardingStep1: "ソースを追加",
    onboardingStep2: "スキルグラフを生成",
    onboardingStep3: "探索して学ぶ",
    onboardingTitle: "3ステップで開始",
    jdMatchNav: "JDマッチ",
    jdMatchTitle: "JDマッチ",
    jdMatchInputLabel: "求人票を貼り付け",
    jdMatchPlaceholder: "求人票の全文をここに貼り付けてください...",
    jdMatchButton: "スキルをマッチ",
    jdMatchAnalyzing: "分析中...",
    jdMatchScoreLabel: "マッチスコア",
    jdMatchMastered: "習得済み",
    jdMatchLearning: "学習中",
    jdMatchMissing: "未学習",
    timelineNav: "タイムライン",
    timelineTitle: "スキルタイムライン",
    timelineFilterPlaceholder: "スキル名でフィルター...",
    timelineEmpty: "スキルイベントはまだありません。ワークスペースでスキル進捗を更新すると、ここに表示されます。",
    timelineNoResults: "フィルターに一致するイベントはありません。",
  },
  "Spanish": {
    myJourneys: "Mis Journeys",
    newJourney: "+ Nuevo Journey",
    creating: "Creando...",
    createFirst: "Crea tu primer journey",
    homeTagline: "Convierte cualquier JD, artículo o concepto en un roadmap de aprendizaje.",
    sources: "Fuentes",
    roadmaps: "roadmap",
    deleteJourney: "Eliminar journey",
    back: "← Volver",
    addSource: "+ Agregar",
    noSourcesYet: "Sin fuentes aún",
    addSourceToStart: "Agrega una fuente para generar tu primer roadmap",
    pasteHint: "Pega una JD, artículo técnico o concepto...",
    adding: "Agregando...",
    cancel: "Cancelar",
    generated: "Generado",
    regenerate: "Regenerar",
    regenerating: "Generando...",
    weavingRoadmap: "Ariadne está tejiendo tu roadbook...",
    readyToGenerate: "Fuente añadida. Lista para generar tu roadbook.",
    generateRoadmap: "Generar Roadbook",
    roadmapReady: "✓ Listo",
    generateSourceRoadmap: "Generar",
    confirmDeleteTitle: "Confirmar eliminación",
    confirmDeleteWorkspace: "Este journey y todas sus fuentes serán eliminados permanentemente.",
    confirmDeleteSource: "Esta fuente y su roadbook serán eliminados permanentemente.",
    deleted: "Eliminado",
    deleteFailed: "Error al eliminar",
    sourceAdded: "Fuente agregada",
    sourceAddFailed: "Error al agregar fuente",
    generationComplete: "Roadbook generado",
    generationFailed: "Error en la generación",
    renameFailed: "Error al renombrar",
    chatSendFailed: "Error al enviar mensaje",
    digestComplete: "Digest completado",
    researchComplete: "Investigación completa — fuente agregada",
    serverUnreachable: "No se puede conectar al servidor",
    retry: "Reintentar",
    noJourneyYet: "Aún no hay Journey Roadmap.",
    journeyHint: "Fusiona múltiples fuentes en un roadmap de aprendizaje integral. Selecciona fuentes en el panel izquierdo y haz clic en Generate Journey.",
    loading: "Cargando...",
    stageParseInput: "Analizando entrada",
    stageExtractSkillTree: "Extrayendo habilidades",
    stageMergeSkillTrees: "Fusionando habilidades",
    stageResearchSkills: "Buscando recursos",
    stageGenerateRoadbook: "Generando roadbook",
    chatEmptyTitle: "Pregunta lo que quieras sobre tus fuentes",
    chatEmptyHint: "Ariadne puede responder preguntas, explicar conceptos o actualizar tu roadbook.",
    chatSuggestion1: "¿Qué debería aprender primero?",
    chatSuggestion2: "Explica los conceptos clave",
    chatSuggestion3: "¿Cuáles son los requisitos previos?",
    insightsEmptyTitle: "Captura ideas mientras exploras",
    insightsEmptyHint: "Guarda observaciones, preguntas y momentos de inspiración.",
    researchEmptyTitle: "Profundiza en un tema",
    researchEmptyHint: "Agrega preguntas de investigación y Ariadne las investigará por ti.",
    skillRadarEmptyTitle: "Tu radar de habilidades está vacío",
    skillRadarEmptyHint: "Genera roadbooks en tus workspaces para ver habilidades aquí.",
    skillRadarEmptyAction: "Ir a workspaces",
    onboardingStep1: "Agrega una fuente",
    onboardingStep2: "Genera un gráfico de habilidades",
    onboardingStep3: "Explora y aprende",
    onboardingTitle: "Comienza en 3 pasos",
    jdMatchNav: "JD Match",
    jdMatchTitle: "JD Match",
    jdMatchInputLabel: "Pega una descripción de puesto",
    jdMatchPlaceholder: "Pega la descripción completa del puesto aquí...",
    jdMatchButton: "Comparar habilidades",
    jdMatchAnalyzing: "Analizando...",
    jdMatchScoreLabel: "Puntuación",
    jdMatchMastered: "Dominado",
    jdMatchLearning: "Aprendiendo",
    jdMatchMissing: "Faltante",
    timelineNav: "Cronología",
    timelineTitle: "Cronología de habilidades",
    timelineFilterPlaceholder: "Filtrar por nombre de habilidad...",
    timelineEmpty: "No hay eventos de habilidades aún. Actualiza el progreso en tus workspaces para ver eventos aquí.",
    timelineNoResults: "No hay eventos que coincidan con tu filtro.",
  },
  "French": {
    myJourneys: "Mes Journeys",
    newJourney: "+ Nouveau Journey",
    creating: "Création...",
    createFirst: "Créez votre premier journey",
    homeTagline: "Transformez toute JD, article ou concept en roadmap d'apprentissage structuré.",
    sources: "Sources",
    roadmaps: "roadmap",
    deleteJourney: "Supprimer le journey",
    back: "← Retour",
    addSource: "+ Ajouter",
    noSourcesYet: "Aucune source",
    addSourceToStart: "Ajoutez une source pour générer votre premier roadmap",
    pasteHint: "Collez une JD, un article ou un concept...",
    adding: "Ajout...",
    cancel: "Annuler",
    generated: "Généré le",
    regenerate: "Régénérer",
    regenerating: "Génération...",
    weavingRoadmap: "Ariadne tisse votre roadbook...",
    readyToGenerate: "Source ajoutée. Prêt à générer votre roadbook.",
    generateRoadmap: "Générer le Roadbook",
    roadmapReady: "✓ Prêt",
    generateSourceRoadmap: "Générer",
    confirmDeleteTitle: "Confirmer la suppression",
    confirmDeleteWorkspace: "Ce journey et toutes ses sources seront supprimés définitivement.",
    confirmDeleteSource: "Cette source et son roadbook seront supprimés définitivement.",
    deleted: "Supprimé",
    deleteFailed: "Échec de la suppression",
    sourceAdded: "Source ajoutée",
    sourceAddFailed: "Échec de l'ajout de la source",
    generationComplete: "Roadbook généré",
    generationFailed: "Échec de la génération",
    renameFailed: "Échec du renommage",
    chatSendFailed: "Échec de l'envoi du message",
    digestComplete: "Digest terminé",
    researchComplete: "Recherche terminée — source ajoutée",
    serverUnreachable: "Impossible de se connecter au serveur",
    retry: "Réessayer",
    noJourneyYet: "Pas encore de Journey Roadmap.",
    journeyHint: "Fusionnez plusieurs sources en un roadmap d'apprentissage complet. Sélectionnez les sources dans le panneau de gauche et cliquez sur Generate Journey.",
    loading: "Chargement...",
    stageParseInput: "Analyse de l'entrée",
    stageExtractSkillTree: "Extraction des compétences",
    stageMergeSkillTrees: "Fusion des compétences",
    stageResearchSkills: "Recherche de ressources",
    stageGenerateRoadbook: "Génération du roadbook",
    chatEmptyTitle: "Posez n'importe quelle question sur vos sources",
    chatEmptyHint: "Ariadne peut répondre aux questions, expliquer des concepts ou mettre à jour votre roadbook.",
    chatSuggestion1: "Par quoi commencer ?",
    chatSuggestion2: "Explique les concepts clés",
    chatSuggestion3: "Quels sont les prérequis ?",
    insightsEmptyTitle: "Capturez vos idées en explorant",
    insightsEmptyHint: "Sauvegardez observations, questions et moments de révélation.",
    researchEmptyTitle: "Approfondissez un sujet",
    researchEmptyHint: "Ajoutez des questions de recherche et Ariadne les explorera pour vous.",
    skillRadarEmptyTitle: "Votre radar de compétences est vide",
    skillRadarEmptyHint: "Générez des roadbooks dans vos workspaces pour voir les compétences ici.",
    skillRadarEmptyAction: "Aller aux workspaces",
    onboardingStep1: "Ajoutez une source",
    onboardingStep2: "Générez un graphe de compétences",
    onboardingStep3: "Explorez et apprenez",
    onboardingTitle: "Commencez en 3 étapes",
    jdMatchNav: "JD Match",
    jdMatchTitle: "JD Match",
    jdMatchInputLabel: "Collez une description de poste",
    jdMatchPlaceholder: "Collez la description complète du poste ici...",
    jdMatchButton: "Comparer les compétences",
    jdMatchAnalyzing: "Analyse en cours...",
    jdMatchScoreLabel: "Score de correspondance",
    jdMatchMastered: "Maîtrisé",
    jdMatchLearning: "En cours",
    jdMatchMissing: "Manquant",
    timelineNav: "Chronologie",
    timelineTitle: "Chronologie des compétences",
    timelineFilterPlaceholder: "Filtrer par nom de compétence...",
    timelineEmpty: "Aucun événement de compétence. Mettez à jour la progression dans vos workspaces pour voir les événements ici.",
    timelineNoResults: "Aucun événement ne correspond à votre filtre.",
  },
};

export const LANGUAGES = [
  { value: "English", label: "English" },
  { value: "Chinese (Simplified)", label: "中文" },
  { value: "Japanese", label: "日本語" },
  { value: "Spanish", label: "Español" },
  { value: "French", label: "Français" },
];

export function t(lang: string): UIStrings {
  return strings[lang] ?? strings["English"];
}
