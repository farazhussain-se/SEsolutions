// components/SavedEnvironments.tsx
import { useState, useMemo, useEffect } from "react";
import { LuTrash, LuEye, LuEyeOff, LuCopy, LuCheck } from "react-icons/lu";
import { FaStar, FaRegStar } from "react-icons/fa";
import {
  buttonStyle,
  actionButtonStyle,
  dangerButtonStyle,
  apiKeyLabelStyle,
  savedTokenStyle,
  buttonsContainerStyle,
} from "../styles";
import { colors } from "../styles/colors";

interface SavedToken {
  slug: string;
  truncatedToken: string;
  fullToken?: string;
  branchId?: string | null;
  starred?: boolean;
  domain?: string;
}

interface UseEntry {
  slug: string;
  token: string;
  branchId?: string | null;
  domain: string;
}

interface SavedEnvironmentsProps {
  savedTokens: SavedToken[];
  showFull: string | null;
  selectedSlug: string | null;
  onUse: (entry: UseEntry) => void;
  onCancel: () => void;
  onToggle: (slug: string) => void;
  onDelete: (slug: string) => void;
  onAdd: () => void;
  onStar: (slug: string) => void;
}

// --- STYLES & KEYFRAMES ---

const starStyle = {
  cursor: "pointer",
  marginRight: "8px",
  color: colors.border,
  transition: "color 0.2s ease-in-out, transform 0.2s ease-in-out",
};

const starHoverStyle = {
  color: colors.text,
  transform: "scale(1.2)",
};

const unstarKeyframes = `
  @keyframes unstar-pop {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(0); opacity: 0; }
  }
`;

const DEFAULT_DOMAIN = "app.staffbase.com";

const slideInKeyframes = `
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const filterKeyframes = `
  @keyframes filter-drop {
    from { opacity: 0; transform: translateY(-6px) scaleY(0.92); }
    to   { opacity: 1; transform: translateY(0) scaleY(1); }
  }
  @keyframes chip-pop {
    0%   { transform: scale(1); }
    40%  { transform: scale(0.88); }
    100% { transform: scale(1); }
  }
  @keyframes results-fade {
    from { opacity: 0.4; }
    to   { opacity: 1; }
  }
  @keyframes check-pop {
    0%   { transform: scale(0.5); opacity: 0; }
    60%  { transform: scale(1.25); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
`;

// --- EXPLODING STAR ANIMATION COMPONENT ---

const confettiKeyframes = [
  { p1: 'translate(0, -15px)', p2: 'translate(5px, -25px)' },
  { p1: 'translate(15px, -7px)', p2: 'translate(30px, -7px)' },
  { p1: 'translate(15px, 0px)', p2: 'translate(30px, 5px)' },
  { p1: 'translate(15px, 7px)', p2: 'translate(20px, 25px)' },
  { p1: 'translate(-5px, 10px)', p2: 'translate(-30px, 15px)' },
  { p1: 'translate(-15px, 0px)', p2: 'translate(-30px, -2px)' },
  { p1: 'translate(-15px, -7px)', p2: 'translate(-27px, -15px)' },
].map((anim, i) => `
  @keyframes move-particle1-${i} {
    from { transform: scale(1) translate(0,0); opacity: 1; }
    to { transform: scale(0) ${anim.p1}; opacity: 0; }
  }
  @keyframes move-particle2-${i} {
    from { transform: scale(1) translate(0,0); opacity: 1; }
    to { transform: scale(0) ${anim.p2}; opacity: 0; }
  }
`).join('');

const allExplosionKeyframes = `
  @keyframes animateStar {
    0%   { transform: scale(0.2); opacity: 0; }
    20%  { transform: scale(1.5); opacity: 0.4; }
    50%  { transform: scale(2); opacity: 0; }
    80%  { transform: scale(1.2); opacity: 0.6; }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes animateCircle {
    0%   { transform: scale(0); opacity: 0; stroke: ${colors.primary}; stroke-width: 1; fill: none; }
    20%  { opacity: 0.5; }
    50%  { transform: scale(6); opacity: 0.3; }
    80%  { transform: scale(9); opacity: 0.15; stroke-width: 0.5; }
    100% { transform: scale(12); opacity: 0; stroke-width: 0; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  ${confettiKeyframes}
`;

interface ConfettiParticle {
  d: string;
  fill: string;
}

interface ConfettiGroup {
  id: string;
  transform: string;
  particles: ConfettiParticle[];
}

interface ExplodingStarProps {
  isExploding: boolean;
  size?: number;
}

const ExplodingStar = ({ isExploding, size = 24 }: ExplodingStarProps) => {
  const starPath = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";
  const particleStarPath = "M5,0 L6.1,3.5 L9.8,3.5 L6.8,5.7 L7.9,9.2 L5,7 L2.1,9.2 L3.2,5.7 L0.2,3.5 L3.9,3.5 Z";
  const reactIconPath = "M0,-1 A1,1 0 1,0 0,1 A1,1 0 1,0 0,-1 Z";

  const confettiGroups: ConfettiGroup[] = [
    { id: 'grp1', transform: 'translate(11 0)', particles: [{ d: particleStarPath, fill: '#9FC7FA' }, { d: reactIconPath, fill: '#9FC7FA' }] },
    { id: 'grp2', transform: 'translate(20 3)', particles: [{ d: particleStarPath, fill: '#CC8EF5' }, { d: reactIconPath, fill: '#CC8EF5' }] },
    { id: 'grp3', transform: 'translate(24 13)', particles: [{ d: particleStarPath, fill: '#9CD8C3' }, { d: reactIconPath, fill: '#8CE8C3' }] },
    { id: 'grp4', transform: 'translate(16 23)', particles: [{ d: particleStarPath, fill: '#F48EA7' }, { d: reactIconPath, fill: '#F48EA7' }] },
    { id: 'grp5', transform: 'translate(6 23)', particles: [{ d: particleStarPath, fill: '#91D2FA' }, { d: reactIconPath, fill: '#91D2FA' }] },
    { id: 'grp6', transform: 'translate(0 13)', particles: [{ d: particleStarPath, fill: '#CC8EF5' }, { d: reactIconPath, fill: '#91D2FA' }] },
    { id: 'grp7', transform: 'translate(3 3)', particles: [{ d: particleStarPath, fill: '#9CD8C3' }, { d: reactIconPath, fill: '#8CE8C3' }] },
  ];

  const explodingStyle = `
  .exploding-star-container .particle1,
  .exploding-star-container .particle2 {
    transform-origin: 0 0 0;
  }
  .exploding-star-container.exploded .star-path {
    fill: ${colors.primary};
    animation: animateStar 0.75s ease-out forwards 0.05s;
  }
  .exploding-star-container.exploded .main-circ {
    animation: animateCircle 0.75s ease-out forwards;
  }
  ${confettiGroups.map((g, i) => `
    .exploding-star-container.exploded #${g.id} {
      animation: fadeIn 0.15s linear forwards 0.1s;
    }
    .exploding-star-container.exploded #${g.id} .particle1 {
      animation: move-particle1-${i} 0.75s ease-out forwards 0.1s;
    }
    .exploding-star-container.exploded #${g.id} .particle2 {
      animation: move-particle2-${i} 0.75s ease-out forwards 0.1s;
    }
  `).join('')}
`;

  return (
    <div className={`exploding-star-container ${isExploding ? 'exploded' : ''}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 100 }}>
      <style>{allExplosionKeyframes}{explodingStyle}</style>
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ overflow: 'visible' }}>
        <g>
          <path className="star-path" d={starPath} fill={colors.border} style={{ transformOrigin: 'center' }} />
          <circle
            className="main-circ"
            cx="12"
            cy="12"
            r="1"
            fill="none"
            stroke={colors.primary}
            opacity="0"
            style={{ transformOrigin: '12px 12px' }}
          />
          {confettiGroups.map(g => (
            <g key={g.id} id={g.id} style={{ opacity: 0 }} transform={g.transform}>
              {g.particles.map((particle, i) => (
                <path key={i} className={`particle${i + 1}`} d={particle.d} fill={particle.fill} />
              ))}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};


// --- MAIN SAVED ENVIRONMENTS COMPONENT ---

export default function SavedEnvironments({
  savedTokens,
  showFull,
  selectedSlug,
  onUse,
  onCancel,
  onToggle,
  onDelete,
  onAdd,
  onStar,
}: SavedEnvironmentsProps) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [explodingStar, setExplodingStar] = useState<string | null>(null);
  const [justStarred, setJustStarred] = useState<string | null>(null);
  const [unstarringSlug, setUnstarringSlug] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeDomainFilter, setActiveDomainFilter] = useState<string | null>(null);
  const [hideUnstarred, setHideUnstarred] = useState(() => {
    try {
      const stored = localStorage.getItem('replify-hideUnstarred');
      return stored ? (JSON.parse(stored) as boolean) : false;
    } catch {
      return false;
    }
  });

  const sortedTokens = useMemo(() => {
    return [...savedTokens].sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      return 0;
    });
  }, [savedTokens]);

  useEffect(() => {
    if (justStarred) {
      const timer = setTimeout(() => setJustStarred(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [justStarred]);

  const handleToggleHideUnstarred = () => {
    const newState = !hideUnstarred;
    setHideUnstarred(newState);
    try {
      localStorage.setItem('replify-hideUnstarred', JSON.stringify(newState));
    } catch (e) {
      console.error("Could not save 'hideUnstarred' preference:", e);
    }
  };

  const getDomainType = (domain?: string): string => {
    if (!domain || domain === 'app.staffbase.com') return 'app';
    if (domain.endsWith('.staffbase.rocks')) return '.rocks';
    if (domain.endsWith('.staffbase.com')) return '.com';
    if (domain.endsWith('.staffbase.dev')) return '.dev';
    return 'other';
  };

  const domainTypes = useMemo(() => {
    const types = new Set(sortedTokens.map(t => getDomainType(t.domain)));
    return [...types];
  }, [sortedTokens]);

  const showDomainFilter = domainTypes.length > 1;

  const environmentsToShow = useMemo(() => {
    if (selectedSlug) return sortedTokens.filter(({ slug }) => slug === selectedSlug);
    let base = hideUnstarred ? sortedTokens.filter(t => t.starred) : sortedTokens;
    if (activeDomainFilter) base = base.filter(t => getDomainType(t.domain) === activeDomainFilter);
    if (filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      base = base.filter(({ slug }) => slug.toLowerCase().includes(q));
    }
    return base;
  }, [sortedTokens, selectedSlug, hideUnstarred, filterQuery, activeDomainFilter]);

  const isAnEnvironmentSelected = !!selectedSlug;

  const lastStarredIndex = useMemo(() => {
    for (let i = environmentsToShow.length - 1; i >= 0; i--) {
      if (environmentsToShow[i].starred) return i;
    }
    return -1;
  }, [environmentsToShow]);

  const hasStarredItems = sortedTokens.some(t => t.starred);
  const hasMoreThanThreeItems = sortedTokens.length > 3;
  const showFilter = !isAnEnvironmentSelected && sortedTokens.length > 4;

  if (!savedTokens.length) {
    return (
      <div>
        <div style={{ marginBottom: "5px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Saved environments</h3>
            <button
              onClick={() => onAdd()}
              style={{ borderRadius: "50%", width: 30, height: 30, fontSize: 20, fontWeight: "bold", backgroundColor: colors.primary, color: "white", border: "none", cursor: "pointer" }} >
              +
            </button>
          </div>
        </div>
        <p>You have not added any environments yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "5px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Saved environments</h3>
          {!isAnEnvironmentSelected && (
            <button
              onClick={() => onAdd()}
              style={{ borderRadius: "50%", width: 30, height: 30, fontSize: 20, fontWeight: "bold", backgroundColor: hoveredButton === 'add' ? colors.primaryLight : colors.primary, color: colors.textOnPrimary, border: "none", cursor: "pointer", transition: "background-color 0.2s ease-in-out" }}
              onMouseEnter={() => setHoveredButton('add')}
              onMouseLeave={() => setHoveredButton(null)} >
              +
            </button>
          )}
        </div>
      </div>
      <style>{unstarKeyframes}{slideInKeyframes}{filterKeyframes}</style>

      {showFilter && (
        <div style={{ animation: 'filter-drop 0.28s cubic-bezier(0.34,1.56,0.64,1) both', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {showDomainFilter && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <button
                onClick={() => setActiveDomainFilter(null)}
                style={{
                  padding: '3px 10px', borderRadius: 20, cursor: 'pointer', letterSpacing: '0.02em', transition: 'all 0.15s ease', fontSize: 11,
                  border: `1.5px solid ${!activeDomainFilter ? colors.primary : colors.borderMedium}`,
                  background: !activeDomainFilter ? colors.primary : 'transparent',
                  color: !activeDomainFilter ? colors.textOnPrimary : colors.textMuted,
                  fontWeight: !activeDomainFilter ? 600 : 400,
                }}
              >All</button>
              {domainTypes.map(type => {
                const isActive = activeDomainFilter === type;
                return (
                  <button
                    key={type}
                    onClick={() => setActiveDomainFilter(isActive ? null : type)}
                    style={{
                      padding: '3px 10px', borderRadius: 20, cursor: 'pointer', letterSpacing: '0.02em', transition: 'all 0.15s ease', fontSize: 11,
                      border: `1.5px solid ${isActive ? colors.primary : colors.borderMedium}`,
                      background: isActive ? `${colors.primary}18` : 'transparent',
                      color: isActive ? colors.primary : colors.textMuted,
                      fontWeight: isActive ? 600 : 400,
                      animation: isActive ? 'chip-pop 0.2s ease-out' : undefined,
                    }}
                  >{type}</button>
                );
              })}
            </div>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20,
            border: `1.5px solid ${searchFocused ? colors.primary : colors.borderMedium}`,
            background: searchFocused ? `${colors.primary}08` : colors.backgroundLight,
            transition: 'border-color 0.18s ease, background 0.18s ease',
            boxShadow: searchFocused ? `0 0 0 3px ${colors.primary}22` : 'none',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={searchFocused ? colors.primary : colors.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'stroke 0.18s ease' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Filter environments…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: colors.textDark, width: '100%', letterSpacing: '0.01em' }}
            />
            {filterQuery && (
              <button onClick={() => setFilterQuery("")} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: colors.textMuted, lineHeight: 1, fontSize: 14, display: 'flex' }}>×</button>
            )}
          </div>
          {environmentsToShow.length === 0 && (filterQuery || activeDomainFilter) && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: colors.textMuted, textAlign: 'center' }}>
              No environments match.
            </p>
          )}
        </div>
      )}

      {environmentsToShow.map(({ slug, truncatedToken, fullToken, branchId, starred, domain }, index) => {
        const dynamicSavedTokenStyle = { ...savedTokenStyle };
        if (environmentsToShow.length === 1) {
          dynamicSavedTokenStyle.borderBottom = "none";
        }
        if (lastStarredIndex !== -1 && index === lastStarredIndex && lastStarredIndex < environmentsToShow.length - 1) {
          dynamicSavedTokenStyle.borderBottom = `2px solid ${colors.primaryLight}`;
        }
        if (justStarred === slug) {
          dynamicSavedTokenStyle.animation = 'slide-in 0.5s ease-out forwards';
        } else if (filterQuery || activeDomainFilter) {
          dynamicSavedTokenStyle.animation = `results-fade 0.18s ease-out ${index * 0.04}s both`;
        }

        return (
          <div key={slug} style={dynamicSavedTokenStyle}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', position: 'relative' }}>
              <div style={{ position: "relative", display: 'flex', alignItems: 'center' }}>
                <button
                  style={{ background: "none", border: "none", padding: "5px", display: 'flex', alignItems: 'center' }}
                  onClick={() => {
                    if (!starred) {
                      setExplodingStar(slug);
                      setJustStarred(slug);
                      setTimeout(() => setExplodingStar(null), 750);
                    } else {
                      setUnstarringSlug(slug);
                      setTimeout(() => {
                        onStar(slug);
                        setUnstarringSlug(null);
                      }, 300);
                      return;
                    }
                    onStar(slug);
                  }}
                  onMouseEnter={() => setHoveredButton(`star-${slug}`)}
                  onMouseLeave={() => setHoveredButton(null)} >
                  {starred ? (
                    <FaStar color={colors.primary} style={{ marginRight: '8px', animation: unstarringSlug === slug ? 'unstar-pop 0.3s ease-out forwards' : '' }} />
                  ) : <FaRegStar style={{ ...starStyle, ...(hoveredButton === `star-${slug}` && starHoverStyle) }} />}
                  {explodingStar === slug && <ExplodingStar isExploding={true} />}
                </button>
              </div>
              <div style={{ minWidth: 0 }}>
                <strong>{slug}</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3, marginTop: 1, flexWrap: showFull === slug ? 'wrap' : 'nowrap', minWidth: 0 }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: colors.textMuted,
                    overflow: 'hidden',
                    textOverflow: showFull === slug ? 'unset' : 'ellipsis',
                    whiteSpace: showFull === slug ? 'normal' : 'nowrap',
                    wordBreak: showFull === slug ? 'break-all' : 'normal',
                  }}>
                    {showFull === slug ? fullToken : truncatedToken}
                  </span>
                  <button
                    onClick={() => onToggle(slug)}
                    onMouseEnter={() => setHoveredButton(`toggle-${slug}`)}
                    onMouseLeave={() => setHoveredButton(null)}
                    title={showFull === slug ? "Hide key" : "Show full key"}
                    style={{
                      flexShrink: 0,
                      background: hoveredButton === `toggle-${slug}` ? colors.backgroundSubtle : 'transparent',
                      border: `1px solid ${hoveredButton === `toggle-${slug}` ? colors.borderMedium : 'transparent'}`,
                      borderRadius: 4, cursor: 'pointer', padding: '2px 3px',
                      display: 'inline-flex', alignItems: 'center',
                      transition: 'background 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    {showFull === slug
                      ? <LuEyeOff size={11} color={colors.primary} />
                      : <LuEye size={11} color={hoveredButton === `toggle-${slug}` ? colors.textDark : colors.textMuted} />
                    }
                  </button>
                  {showFull === slug && (
                    <button
                      onClick={() => {
                        if (fullToken) void navigator.clipboard.writeText(fullToken);
                        setCopiedSlug(slug);
                        setTimeout(() => setCopiedSlug(null), 1500);
                      }}
                      onMouseEnter={() => setHoveredButton(`copy-${slug}`)}
                      onMouseLeave={() => setHoveredButton(null)}
                      title="Copy to clipboard"
                      style={{
                        flexShrink: 0,
                        background: copiedSlug === slug ? `${colors.success}18` : hoveredButton === `copy-${slug}` ? colors.backgroundSubtle : 'transparent',
                        border: `1px solid ${copiedSlug === slug ? colors.success : hoveredButton === `copy-${slug}` ? colors.borderMedium : 'transparent'}`,
                        borderRadius: 4, cursor: 'pointer', padding: '2px 3px',
                        display: 'inline-flex', alignItems: 'center',
                        transition: 'background 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      {copiedSlug === slug
                        ? <LuCheck size={11} color={colors.success} style={{ animation: 'check-pop 0.25s ease-out forwards' }} />
                        : <LuCopy size={11} color={hoveredButton === `copy-${slug}` ? colors.textDark : colors.textMuted} />
                      }
                    </button>
                  )}
                </div>
                <div style={{ ...apiKeyLabelStyle, color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Domain: {domain || DEFAULT_DOMAIN}
                </div>
                {!domain && selectedSlug === slug && (
                  <p style={{ margin: '2px 0 0', fontSize: '11px', fontStyle: 'italic', color: colors.textMuted }}>
                    Assuming {DEFAULT_DOMAIN} for this saved environment.
                  </p>
                )}
              </div>
            </div>

            <div style={buttonsContainerStyle}>
              {isAnEnvironmentSelected ? (
                <button
                  style={{ ...buttonStyle, ...dangerButtonStyle, marginTop: 0, backgroundColor: hoveredButton === 'cancel' ? colors.dangerLight : colors.danger }}
                  onClick={onCancel}
                  onMouseEnter={() => setHoveredButton('cancel')}
                  onMouseLeave={() => setHoveredButton(null)} >
                  Cancel
                </button>
              ) : (
                <button
                  style={{ ...buttonStyle, ...actionButtonStyle, marginTop: 0, backgroundColor: hoveredButton === `use-${slug}` ? colors.primaryLight : colors.primary }}
                  onClick={() => {
                    const effectiveDomain = domain || DEFAULT_DOMAIN;
                    onUse({ slug, token: fullToken ?? '', branchId, domain: effectiveDomain });
                  }}
                  onMouseEnter={() => setHoveredButton(`use-${slug}`)}
                  onMouseLeave={() => setHoveredButton(null)} >
                  Use
                </button>
              )}

              {!isAnEnvironmentSelected && (
                <button
                  style={{ ...dangerButtonStyle, ...actionButtonStyle, marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: hoveredButton === `delete-${slug}` ? colors.dangerLight : colors.danger }}
                  onClick={() => onDelete(slug)}
                  title={`Delete ${slug}`}
                  onMouseEnter={() => setHoveredButton(`delete-${slug}`)}
                  onMouseLeave={() => setHoveredButton(null)} >
                  <LuTrash color={colors.textOnPrimary} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {!isAnEnvironmentSelected && hasStarredItems && hasMoreThanThreeItems && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button
            onClick={handleToggleHideUnstarred}
            style={{ background: 'none', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: '12px', padding: '4px 8px', textDecoration: hoveredButton === 'toggle-unstarred' ? 'underline' : 'none' }}
            onMouseEnter={() => setHoveredButton('toggle-unstarred')}
            onMouseLeave={() => setHoveredButton(null)} >
            {hideUnstarred ? `Show ${sortedTokens.length - environmentsToShow.length} more` : 'Hide un-starred'}
          </button>
        </div>
      )}
    </div>
  );
}
