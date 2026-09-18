import React, { useEffect } from 'react';
import { useProjectStore } from '../stores/project.store';
import { useUIStore } from '../stores/ui.store';
import Welcome from '../pages/Welcome';
import Workspace from '../pages/Workspace';

export default function App() {
  const { activeProject } = useProjectStore();
  const { theme, setCommandPaletteOpen } = useUIStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCommandPaletteOpen]);

  return (
    <div className="h-full w-full flex flex-col font-sans">
      {activeProject ? <Workspace /> : <Welcome />}
    </div>
  );
}
