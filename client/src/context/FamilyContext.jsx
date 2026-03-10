import { createContext, useContext, useState, useEffect, useMemo } from 'react';

const FamilyContext = createContext(null);

export function FamilyProvider({ children }) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(err => console.error('Failed to load family config:', err));
  }, []);

  const value = useMemo(() => {
    if (!config) return null;

    const memberNames = config.members.map(m => m.name);
    const allPeople = [...memberNames, ...(config.guests || [])];

    // Build context→lists map
    const contextListMap = {};
    for (const ctx of config.contexts) {
      contextListMap[ctx.id] = ctx.lists;
    }

    // Build list→context map (for shortlists)
    const listToContext = {};
    for (const ctx of config.contexts) {
      for (const listName of ctx.lists) {
        listToContext[listName] = ctx.id;
      }
    }

    // Avatar lookup
    const avatarMap = {};
    const colorMap = {};
    for (const m of config.members) {
      if (m.avatar) avatarMap[m.name] = m.avatar;
      if (m.color) colorMap[m.name] = m.color;
    }

    return {
      familyName: config.familyName,
      members: config.members,
      memberNames,
      allPeople,
      guests: config.guests || [],
      rotation: config.rotation,
      contexts: config.contexts,
      lists: config.lists,
      streamingServiceIds: new Set(config.streamingServiceIds || []),
      contextListMap,
      listToContext,
      getAvatar: (name) => avatarMap[name] || null,
      getColor: (name) => colorMap[name] || null,
    };
  }, [config]);

  // Show nothing until config loads (near-instant for local server)
  if (!value) return null;

  return (
    <FamilyContext.Provider value={value}>
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  return useContext(FamilyContext);
}
