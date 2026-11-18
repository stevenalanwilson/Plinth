import React from 'react';
import { Route, Routes } from 'react-router-dom';
import App from './App';
import { AlbumPage } from './features/album/AlbumPage';
import { SignInPage } from './features/account/SignInPage';
import { PrivacyPage } from './features/privacy/PrivacyPage';

export function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route path="/album/:slug" element={<AlbumPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="*" element={<App />} />
    </Routes>
  );
}
