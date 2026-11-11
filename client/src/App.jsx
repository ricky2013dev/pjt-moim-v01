import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { BadgeProvider } from './lib/badges.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import News from './pages/News.jsx';
import Family from './pages/Family.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import Messages from './pages/Messages.jsx';
import Thread from './pages/Thread.jsx';
import Me from './pages/Me.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const { me } = useAuth();
  if (me === undefined) {
    return <div className="grid h-full place-items-center"><img src="/icon.svg" alt="" className="size-14 animate-pulse" /></div>;
  }
  if (!me) return <Login />;
  return (
    <BadgeProvider key={me.id}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<News />} />
          <Route path="family" element={<Family />} />
          <Route path="family/:id" element={<MemberDetail />} />
          <Route path="messages" element={<Messages />} />
          <Route path="messages/:id" element={<Thread />} />
          <Route path="me" element={<Me />} />
          {me.role === 'admin' && <Route path="admin" element={<Admin />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BadgeProvider>
  );
}
