import { createContext, useContext, useState, useCallback } from 'react';

const PersonContext = createContext(null);

const STORAGE_KEY = 'movie-night-person';

export function PersonProvider({ children }) {
  const [currentPerson, setCurrentPersonState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || null
  );
  const [showPicker, setShowPicker] = useState(!localStorage.getItem(STORAGE_KEY));

  const setCurrentPerson = useCallback((name) => {
    if (name) {
      localStorage.setItem(STORAGE_KEY, name);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setCurrentPersonState(name);
    setShowPicker(false);
  }, []);

  const openPicker = useCallback(() => setShowPicker(true), []);
  const closePicker = useCallback(() => {
    // Only allow closing if a person is already set
    if (currentPerson) setShowPicker(false);
  }, [currentPerson]);

  return (
    <PersonContext.Provider value={{ currentPerson, setCurrentPerson, showPicker, openPicker, closePicker }}>
      {children}
    </PersonContext.Provider>
  );
}

export function usePerson() {
  return useContext(PersonContext);
}
