import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import LogViewing from '../components/LogViewing';
import TMDBPicker from '../components/TMDBPicker';
import ViewingItem from '../components/ViewingItem';
import EditableTitle from '../components/EditableTitle';
import AddToListSheet from '../components/AddToListSheet';
import AddToCollectionForm from '../components/AddToCollectionForm';
import { usePerson } from '../context/PersonContext';
import { useFamily } from '../context/FamilyContext';
import { useConfirm } from '../components/ConfirmDialog';
import { parseJSON } from '../utils';

function relativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export default function TitleDetail() {
  const {
    allPeople: PEOPLE,
    listToContext: LIST_TO_CONTEXT,
    streamingServiceIds: MY_SERVICE_IDS,
  } = useFamily();
  const confirm = useConfirm();
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [showTMDB, setShowTMDB] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);
  const [watchProviders, setWatchProviders] = useState(null);
  const [watchProvidersUpdatedAt, setWatchProvidersUpdatedAt] = useState(null);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [showAddToCollection, setShowAddToCollection] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [editingAddedBy, setEditingAddedBy] = useState(null); // list_item_id being edited
  const [showStatuses, setShowStatuses] = useState([]); // per-person show progress
  const { currentPerson } = usePerson();

  const loadTitle = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/api/titles/${id}`);
      const data = await res.json();
      setTitle(data);
      // Load cached watch providers if available
      if (data.watch_providers) {
        setWatchProviders(parseJSON(data.watch_providers, null));
        setWatchProvidersUpdatedAt(data.watch_providers_updated_at);
      } else {
        setWatchProviders(null);
        setWatchProvidersUpdatedAt(null);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTitle();
  }, [loadTitle]);
  useEffect(() => {
    // Load show status whenever we have a show title
    if (title?.type === 'show') {
      api(`/api/show-status?title_id=${id}`)
        .then((r) => r.json())
        .then(setShowStatuses)
        .catch(() => {});
    }
  }, [id, title?.type]);

  async function toggleShortlist(person, context) {
    await api('/api/shortlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title_id: Number(id), person, context }),
    });
    // Update local state
    setTitle((t) => {
      if (!t) return t;
      const shortlists = t.shortlists || [];
      const existing = shortlists.find((s) => s.person === person && s.context === context);
      return {
        ...t,
        shortlists: existing
          ? shortlists.filter((s) => !(s.person === person && s.context === context))
          : [...shortlists, { person, context }],
      };
    });
  }

  async function updateShowStatus(person, status) {
    if (status === null) {
      await api('/api/show-status', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title_id: Number(id), person }),
      });
    } else {
      await api('/api/show-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title_id: Number(id), person, status }),
      });
    }
    // Refresh statuses and title (list memberships may have changed)
    const [statusRes] = await Promise.all([
      api(`/api/show-status?title_id=${id}`).then((r) => r.json()),
      loadTitle(),
    ]);
    setShowStatuses(statusRes);
  }

  async function fetchWatchProviders(refresh = false) {
    setLoadingProviders(true);
    try {
      const res = await api(`/api/tmdb/watch-providers/${id}${refresh ? '?refresh=true' : ''}`);
      const data = await res.json();
      setWatchProviders(data.watch_providers);
      setWatchProvidersUpdatedAt(data.watch_providers_updated_at);
    } finally {
      setLoadingProviders(false);
    }
  }

  async function addToCollection(format, platform, notes) {
    setAddingToCollection(true);
    try {
      const res = await api('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title_id: title.id,
          format,
          platform: platform || null,
          notes: notes || null,
        }),
      });
      if (res.ok) {
        setShowAddToCollection(false);
        loadTitle();
      } else if (res.status === 409) {
        await confirm({
          message: `This title already has a ${format === 'bluray' ? 'Blu-ray' : format.toUpperCase()} entry in the collection.`,
          confirmLabel: 'OK',
          cancelLabel: null,
        });
      }
    } finally {
      setAddingToCollection(false);
    }
  }

  async function removeFromCollection(collectionId) {
    if (
      !(await confirm({
        message: 'Remove from collection?',
        confirmLabel: 'Remove',
        destructive: true,
      }))
    )
      return;
    await api(`/api/collection/${collectionId}`, { method: 'DELETE' });
    loadTitle();
  }

  async function updateAddedBy(listName, listItemId, people) {
    const added_by = people.length ? people.join(',') : null;
    await api(`/api/lists/${listName}/items/${listItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ added_by }),
    });
    setTitle((t) => ({
      ...t,
      listMemberships: t.listMemberships.map((l) =>
        l.list_item_id === listItemId ? { ...l, added_by } : l
      ),
    }));
  }

  async function saveTitle(newName) {
    await api(`/api/titles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newName }),
    });
    setTitle((t) => ({ ...t, title: newName }));
  }

  async function deleteViewing(viewingId) {
    if (
      !(await confirm({
        message: 'Delete this viewing?',
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return;
    await api(`/api/viewings/${viewingId}`, { method: 'DELETE' });
    loadTitle();
  }

  if (loading)
    return (
      <div className="pb-safe px-4 pt-16">
        <div className="bg-slate-800 rounded-2xl h-48 animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );

  if (!title) return <div className="px-4 pt-16 text-slate-400">Not found</div>;

  const cast = parseJSON(title.cast);
  const genres = parseJSON(title.genre);
  // Collect all per-person ratings across all viewings; fall back to group rating
  const allRatings = (title.viewings || []).flatMap((v) => {
    const vp = parseJSON(v.people);
    const personRatings = vp.map((p) => p.rating).filter((r) => r != null);
    return personRatings.length > 0 ? personRatings : v.rating ? [v.rating] : [];
  });
  const avgRating = allRatings.length
    ? (allRatings.reduce((s, r) => s + r, 0) / allRatings.length).toFixed(1)
    : null;

  return (
    <div className="pb-safe">
      {/* Hero */}
      <div className="relative">
        {title.poster_url && (
          <div className="h-56 overflow-hidden">
            <img
              src={title.poster_url}
              alt={title.title}
              className="w-full h-full object-cover object-top opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
          </div>
        )}
        <div className="absolute top-0 left-0 right-0 flex items-center gap-3 px-4 pt-14">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="bg-slate-900/80 backdrop-blur rounded-full p-2 text-slate-300 hover:text-white flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        <div
          className={`px-4 ${title.poster_url ? 'absolute bottom-0 left-0 right-0 pb-4' : 'pt-16 pb-4'}`}
        >
          <div className="flex items-end gap-3">
            {title.poster_url && (
              <img
                src={title.poster_url}
                alt={title.title}
                className="w-20 h-28 object-cover rounded-xl shadow-lg flex-shrink-0 border-2 border-slate-700"
              />
            )}
            <div className="flex-1 min-w-0">
              <EditableTitle value={title.title} onSave={saveTitle} />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-sm text-slate-400">
                {title.year && <span>{title.year}</span>}
                {title.runtime_minutes && (
                  <>
                    <span>·</span>
                    <span>{title.runtime_minutes}m</span>
                  </>
                )}
                {avgRating && (
                  <span className="flex items-center gap-0.5 text-amber-400 font-medium">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {avgRating}
                  </span>
                )}
              </div>
              {title.director && (
                <p className="text-xs text-slate-500 mt-0.5">dir. {title.director}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`px-4 ${title.poster_url ? 'mt-4' : 'mt-0'} space-y-4`}>
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <span
                key={g}
                className="text-xs bg-slate-800 text-slate-300 rounded-full px-2.5 py-1"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {title.synopsis && (
          <p className="text-sm text-slate-400 leading-relaxed">{title.synopsis}</p>
        )}

        {cast.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Cast
            </h3>
            <p className="text-sm text-slate-300">{cast.join(', ')}</p>
          </div>
        )}

        {title.listMemberships?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              On Lists
            </h3>
            <div className="space-y-1.5">
              {title.listMemberships.map((l) => {
                const currentPeople = l.added_by ? l.added_by.split(',').map((s) => s.trim()) : [];
                const ctx = LIST_TO_CONTEXT[l.name];
                const shortlistedBy = ctx
                  ? (title.shortlists || []).filter((s) => s.context === ctx).map((s) => s.person)
                  : [];
                const isMeStarred = currentPerson && shortlistedBy.includes(currentPerson);
                const hasAnyStar = shortlistedBy.length > 0;
                return (
                  <div key={l.list_item_id || l.name} className="relative">
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/lists/${l.name}`}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-full px-2.5 py-1 transition-colors"
                      >
                        {l.display_name}
                        {l.streaming_service && (
                          <span className="text-slate-500"> · {l.streaming_service}</span>
                        )}
                      </Link>
                      {ctx && (
                        <button
                          onClick={() => currentPerson && toggleShortlist(currentPerson, ctx)}
                          className={`transition-colors ${isMeStarred ? 'text-amber-400' : hasAnyStar ? 'text-amber-600' : 'text-slate-500 hover:text-slate-400'}`}
                          title={
                            hasAnyStar ? `Starred by ${shortlistedBy.join(', ')}` : 'Star this'
                          }
                        >
                          <svg
                            className="w-4 h-4"
                            fill={hasAnyStar ? 'currentColor' : 'none'}
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                            />
                          </svg>
                        </button>
                      )}
                      {hasAnyStar && (
                        <span className="text-xs text-amber-500/70">
                          {shortlistedBy.join(', ')}
                        </span>
                      )}
                      <button
                        onClick={() =>
                          setEditingAddedBy(
                            editingAddedBy === l.list_item_id ? null : l.list_item_id
                          )
                        }
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {currentPeople.length > 0
                          ? currentPeople.map((p) => `${p}'s pick`).join(', ')
                          : 'set picker'}
                      </button>
                    </div>
                    {editingAddedBy === l.list_item_id && (
                      <div className="mt-1.5 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-xl flex flex-wrap gap-1.5">
                        {PEOPLE.map((person) => {
                          const isSelected = currentPeople.includes(person);
                          return (
                            <button
                              key={person}
                              onClick={() => {
                                const updated = isSelected
                                  ? currentPeople.filter((p) => p !== person)
                                  : [...currentPeople, person];
                                updateAddedBy(l.name, l.list_item_id, updated);
                              }}
                              className={`text-xs rounded-full px-2.5 py-1 font-medium transition-colors ${
                                isSelected
                                  ? 'bg-amber-500 text-black'
                                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              }`}
                            >
                              {person}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Shortlisted — standalone section visible regardless of list membership */}
        {(() => {
          const shortlists = title.shortlists || [];
          // Group by context
          const byContext = {};
          for (const s of shortlists) {
            if (!byContext[s.context]) byContext[s.context] = [];
            byContext[s.context].push(s.person);
          }
          const contextEntries = Object.entries(byContext);

          // Show section if there are any shortlists OR the title is on a list (so user can toggle)
          if (contextEntries.length === 0 && !title.listMemberships?.length) return null;

          return (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Shortlisted
              </h3>
              {contextEntries.length > 0 ? (
                <div className="space-y-1">
                  {contextEntries.map(([ctx, people]) => (
                    <div key={ctx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 capitalize w-16">{ctx}</span>
                      <div className="flex items-center gap-1">
                        {people.map((p) => (
                          <button
                            key={p}
                            onClick={() => currentPerson && toggleShortlist(p, ctx)}
                            className={`text-xs rounded-full px-2 py-0.5 font-medium transition-colors ${
                              p === currentPerson
                                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {p} <span className="text-amber-400">★</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Not shortlisted yet</p>
              )}
            </div>
          );
        })()}

        {/* Where to Watch / Collection */}
        {title.tmdb_id || title.collection?.length > 0 ? (
          <div>
            {watchProviders || watchProvidersUpdatedAt || title.collection?.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Where to Watch
                  </h3>
                  <div className="flex items-center gap-2">
                    {watchProvidersUpdatedAt && (
                      <>
                        <span className="text-xs text-slate-500">
                          {relativeTime(watchProvidersUpdatedAt)}
                        </span>
                        <button
                          onClick={() => fetchWatchProviders(true)}
                          disabled={loadingProviders}
                          className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
                          title="Refresh availability"
                        >
                          <svg
                            className={`w-3.5 h-3.5 ${loadingProviders ? 'animate-spin' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {!watchProviders && watchProvidersUpdatedAt && (
                  <p className="text-sm text-slate-500 italic">
                    Not currently available for streaming in Canada
                  </p>
                )}
                {watchProviders &&
                  (() => {
                    const stream = [
                      ...(watchProviders.flatrate || []),
                      ...(watchProviders.free || []),
                    ];
                    const rentBuy = [...(watchProviders.rent || []), ...(watchProviders.buy || [])];
                    // Deduplicate by provider_id
                    const uniqueStream = [
                      ...new Map(stream.map((p) => [p.provider_id, p])).values(),
                    ];
                    const uniqueRentBuy = [
                      ...new Map(rentBuy.map((p) => [p.provider_id, p])).values(),
                    ];
                    // Sort: user's services first
                    const sortProviders = (a, b) =>
                      (MY_SERVICE_IDS.has(b.provider_id) ? 1 : 0) -
                      (MY_SERVICE_IDS.has(a.provider_id) ? 1 : 0);
                    uniqueStream.sort(sortProviders);
                    uniqueRentBuy.sort(sortProviders);

                    if (uniqueStream.length === 0 && uniqueRentBuy.length === 0) {
                      return (
                        <p className="text-sm text-slate-500 italic">
                          Not currently available for streaming in Canada
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {uniqueStream.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {uniqueStream.map((p) => (
                              <div
                                key={p.provider_id}
                                className="flex flex-col items-center gap-1"
                                title={p.provider_name}
                              >
                                <img
                                  src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                                  alt={p.provider_name}
                                  className={`w-9 h-9 rounded-lg ${MY_SERVICE_IDS.has(p.provider_id) ? 'ring-2 ring-green-500/60' : 'ring-1 ring-slate-700'}`}
                                />
                                <span
                                  className={`text-[10px] leading-tight text-center max-w-[3.5rem] truncate ${MY_SERVICE_IDS.has(p.provider_id) ? 'text-green-400' : 'text-slate-500'}`}
                                >
                                  {p.provider_name.replace(/ Amazon Channel$/, '')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {uniqueRentBuy.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1.5">Rent / Buy</p>
                            <div className="flex flex-wrap gap-2">
                              {uniqueRentBuy.map((p) => (
                                <div
                                  key={p.provider_id}
                                  className="flex flex-col items-center gap-1"
                                  title={p.provider_name}
                                >
                                  <img
                                    src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                                    alt={p.provider_name}
                                    className="w-8 h-8 rounded-lg ring-1 ring-slate-700"
                                  />
                                  <span className="text-[10px] leading-tight text-center max-w-[3.5rem] truncate text-slate-500">
                                    {p.provider_name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                {watchProviders && (
                  <div className="flex items-center justify-between mt-2">
                    {watchProviders.link && (
                      <a
                        href={watchProviders.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-slate-400 transition-colors flex items-center gap-1"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        View on TMDB
                      </a>
                    )}
                    <span className="text-[10px] text-slate-700">Data by JustWatch</span>
                  </div>
                )}
              </div>
            ) : title.tmdb_id ? (
              <button
                onClick={() => fetchWatchProviders()}
                disabled={loadingProviders}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loadingProviders ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Checking…
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Where to watch?
                  </>
                )}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Action buttons row */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddToList(true)}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            Add to list
          </button>
          <button
            onClick={() => setShowAddToCollection((v) => !v)}
            className={`flex-1 text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 ${showAddToCollection ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
          >
            <svg
              className="w-4 h-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Own it
          </button>
          <button
            onClick={() => setShowTMDB(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2.5 px-3 rounded-xl transition-colors flex items-center justify-center"
            title={title.tmdb_id ? 'Fix TMDB match' : 'Find on TMDB'}
          >
            <svg
              className="w-4 h-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
          {title.tmdb_id && (
            <a
              href={`https://www.themoviedb.org/${title.type === 'show' ? 'tv' : 'movie'}/${title.tmdb_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2.5 px-3 rounded-xl transition-colors flex items-center justify-center"
              title="View on TMDB"
            >
              <svg
                className="w-4 h-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>

        {/* Collection — inline form + owned items, always accessible */}
        {(showAddToCollection || title.collection?.length > 0) && (
          <div className="bg-slate-800/50 rounded-xl p-3 space-y-2">
            {title.collection?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {title.collection.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5 group/col"
                  >
                    <svg
                      className="w-3.5 h-3.5 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      {c.format === 'digital' ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                        />
                      ) : (
                        <>
                          <circle cx="12" cy="12" r="9" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                    <span className="text-sm text-slate-300">
                      {c.format === 'dvd'
                        ? 'DVD'
                        : c.format === 'bluray'
                          ? 'Blu-ray'
                          : c.platform || 'Digital'}
                    </span>
                    {c.notes && <span className="text-xs text-slate-500">· {c.notes}</span>}
                    <button
                      onClick={() => removeFromCollection(c.id)}
                      className="text-slate-700 hover:text-red-400 ml-0.5 sm:opacity-0 sm:group-hover/col:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {showAddToCollection && (
              <AddToCollectionForm
                onSave={addToCollection}
                onClose={() => setShowAddToCollection(false)}
                saving={addingToCollection}
              />
            )}
          </div>
        )}

        {/* Show status — only for shows */}
        {title.type === 'show' && (
          <div className="bg-slate-800 rounded-xl p-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Show Progress
            </h3>
            <div className="space-y-3">
              {PEOPLE.map((person) => {
                const current = showStatuses.find((s) => s.person === person)?.status || null;
                return (
                  <div key={person}>
                    <div className="text-xs text-slate-400 mb-1.5 font-medium">{person}</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { key: 'wishlist', label: 'Wishlist' },
                        { key: 'watching', label: 'Watching' },
                        { key: 'finished', label: 'Finished' },
                        { key: 'dropped', label: 'Dropped' },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => updateShowStatus(person, current === key ? null : key)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            current === key
                              ? key === 'watching'
                                ? 'bg-blue-500 text-white'
                                : key === 'finished'
                                  ? 'bg-green-500 text-white'
                                  : key === 'dropped'
                                    ? 'bg-slate-500 text-white'
                                    : 'bg-amber-500 text-black'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Log viewing */}
        <button
          onClick={() => setShowLog(true)}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {title.type === 'show' ? 'Log a Session' : 'Log a Viewing'}
        </button>

        {/* Viewings */}
        {title.viewings?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {title.type === 'show' ? 'Sessions' : 'Viewings'} ({title.viewings.length})
            </h3>
            <div className="space-y-2">
              {title.viewings.map((v) => (
                <ViewingItem key={v.id} v={v} onDelete={deleteViewing} onSaved={loadTitle} />
              ))}
            </div>
          </div>
        )}
      </div>

      {showLog && (
        <LogViewing
          titleId={title.id}
          titleName={title.title}
          onClose={() => setShowLog(false)}
          onSaved={() => {
            setShowLog(false);
            loadTitle();
          }}
        />
      )}

      {showAddToList && (
        <AddToListSheet
          titleId={title.id}
          currentMemberships={title.listMemberships}
          onClose={() => setShowAddToList(false)}
          onAdded={() => loadTitle()}
        />
      )}

      {showTMDB && (
        <TMDBPicker
          titleId={title.id}
          initialQuery={title.title}
          titleType={title.type}
          onClose={() => setShowTMDB(false)}
          onEnriched={() => {
            setShowTMDB(false);
            loadTitle();
          }}
        />
      )}
    </div>
  );
}
