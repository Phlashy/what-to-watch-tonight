import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import PersonPicker from './components/PersonPicker';
import WhatToWatch from './pages/WhatToWatch';
import WatchLog from './pages/WatchLog';
import Search from './pages/Search';
import Lists from './pages/Lists';
import ListDetail from './pages/ListDetail';
import TitleDetail from './pages/TitleDetail';
import Collection from './pages/Collection';
import Chat from './pages/Chat';

export default function App() {
  return (
    <BrowserRouter basename="/movie-night">
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Routes>
          <Route path="/" element={<WhatToWatch />} />
          <Route path="/log" element={<WatchLog />} />
          <Route path="/search" element={<Search />} />
          <Route path="/lists" element={<Lists />} />
          <Route path="/lists/:name" element={<ListDetail />} />
          <Route path="/title/:id" element={<TitleDetail />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <NavBar />
        <PersonPicker />
      </div>
    </BrowserRouter>
  );
}
