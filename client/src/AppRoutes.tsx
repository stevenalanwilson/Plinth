import React from 'react';
import { Route, Routes } from 'react-router-dom';
import App from './App';
import { AlbumPage } from './features/album/AlbumPage';

export function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route path="/album/:slug" element={<AlbumPage />} />
      <Route path="*" element={<App />} />
    </Routes>
  );
}
