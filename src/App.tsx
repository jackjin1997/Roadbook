import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import WorkspaceList from "./pages/WorkspaceList";
import WorkspacePage from "./pages/Workspace";
import SkillRadar from "./pages/SkillRadar";
import JDMatch from "./pages/JDMatch";
import SkillTimeline from "./pages/SkillTimeline";
import ShareCard from "./pages/ShareCard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/workspaces" element={<WorkspaceList />} />
      <Route path="/workspace/:id" element={<WorkspacePage />} />
      <Route path="/skills" element={<SkillRadar />} />
      <Route path="/match" element={<JDMatch />} />
      <Route path="/timeline" element={<SkillTimeline />} />
      <Route path="/share" element={<ShareCard />} />
    </Routes>
  );
}
