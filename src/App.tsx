import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import WorkspaceList from "./pages/WorkspaceList";
import WorkspacePage from "./pages/Workspace";
import SkillRadar from "./pages/SkillRadar";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/workspaces" element={<WorkspaceList />} />
      <Route path="/workspace/:id" element={<WorkspacePage />} />
      <Route path="/skills" element={<SkillRadar />} />
    </Routes>
  );
}
