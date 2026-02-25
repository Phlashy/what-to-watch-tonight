import { NavLink } from 'react-router-dom';
import { usePerson } from '../context/PersonContext';
import PixelAvatar from './PixelAvatar';

const tabs = [
  {
    to: '/',
    label: 'Tonight',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-amber-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
    ),
  },
  {
    to: '/log',
    label: 'Log',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-amber-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/search',
    label: 'Search',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-amber-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    to: '/lists',
    label: 'Lists',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-amber-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    to: '/chat',
    label: 'Ask',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-amber-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
];

export default function NavBar() {
  const { currentPerson, openPicker } = usePerson();
  const hasAvatar = !!currentPerson;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 safe-bottom z-50">
      <div className="flex items-stretch">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className="flex-1"
          >
            {({ isActive }) => (
              <div className={`flex flex-col items-center justify-center py-2 transition-colors ${isActive ? 'text-amber-400' : 'text-slate-400'}`}>
                {tab.icon(isActive)}
                <span className={`text-xs mt-1 font-medium ${isActive ? 'text-amber-400' : 'text-slate-500'}`}>{tab.label}</span>
              </div>
            )}
          </NavLink>
        ))}

        {/* Person avatar */}
        <button
          onClick={openPicker}
          className="flex flex-col items-center justify-center py-2 px-3 min-w-[56px] flex-shrink-0"
          title={currentPerson ? `Switch from ${currentPerson}` : 'Choose who you are'}
        >
          {hasAvatar ? (
            <>
              <PixelAvatar name={currentPerson} size={24} />
              <span className="text-xs mt-1 font-medium text-slate-500 truncate max-w-[44px]">
                {currentPerson.split(' ')[0]}
              </span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs mt-1 font-medium text-slate-500">Me</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
