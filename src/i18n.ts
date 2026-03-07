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

  loading: string;
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
    loading: "Loading...",
  },
  "Chinese (Simplified)": {
    myJourneys: "我的旅程",
    newJourney: "+ 新建旅程",
    creating: "创建中...",
    createFirst: "开启你的第一段旅程",
    homeTagline: "每段旅程，皆有缘起。",
    sources: "缘起",
    roadmaps: "路书",
    deleteJourney: "删除旅程",
    back: "← 返回",
    addSource: "+ 添加缘起",
    noSourcesYet: "暂无缘起",
    addSourceToStart: "添加一条缘起，生成你的第一份路书",
    pasteHint: "粘贴 JD、技术文章或输入技术概念...",
    adding: "添加中...",
    cancel: "取消",
    generated: "生成于",
    regenerate: "重新生成",
    regenerating: "生成中...",
    weavingRoadmap: "Ariadne 正在为你编织路书...",
    readyToGenerate: "缘起已添加，点击生成路书。",
    generateRoadmap: "生成路书",
    roadmapReady: "✓ 已就绪",
    loading: "加载中...",
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
    loading: "読み込み中...",
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
    loading: "Cargando...",
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
    loading: "Chargement...",
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
