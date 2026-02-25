import { useState } from 'react';
import { usePerson } from '../context/PersonContext';
import PixelAvatar, { getAvatarStyle } from './PixelAvatar';

const FAMILY = ['Gordon', 'Nupur', 'Arianne', 'Davin'];

export { getAvatarStyle };

export default function PersonPicker() {
  const { currentPerson, setCurrentPerson, showPicker, closePicker } = usePerson();
  const [guestName, setGuestName] = useState('');

  if (!showPicker) return null;

  function handleGuest(e) {
    e.preventDefault();
    const name = guestName.trim();
    if (name) setCurrentPerson(name);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎬</div>
          <h1 className="text-2xl font-bold text-white">Who are you?</h1>
          <p className="text-slate-400 text-sm mt-1">Your ratings and picks will be saved to your profile.</p>
        </div>

        {/* Family members */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {FAMILY.map(name => (
              <button
                key={name}
                onClick={() => setCurrentPerson(name)}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                  currentPerson === name
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                }`}
              >
                <PixelAvatar name={name} size={40} />
                <span className="text-white font-semibold text-base">{name}</span>
              </button>
          ))}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-slate-500 text-xs font-medium">Visiting?</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        {/* Guest name input */}
        <form onSubmit={handleGuest} className="flex gap-2">
          <input
            type="text"
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder="Enter your name"
            maxLength={30}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={!guestName.trim()}
            className="bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-xl px-4 py-3 text-sm transition-opacity"
          >
            Join
          </button>
        </form>

        {/* Close (only if already set) */}
        {currentPerson && (
          <button
            onClick={closePicker}
            className="w-full mt-4 text-slate-500 text-sm py-2 hover:text-slate-300 transition-colors"
          >
            Cancel — stay as {currentPerson}
          </button>
        )}
      </div>
    </div>
  );
}
