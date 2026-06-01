// components/MergeIntegrationForm.tsx
import { useEffect } from 'react';
import { colors } from '../styles/colors';
import { inputStyle, labelStyle } from '../styles';
import { DEFAULT_WORKDAY_FIELD_TITLE } from '../constants/appConstants';

export interface ProfileField {
  slug: string;
  title: string;
}

export interface MergeConfig {
  field?: string;
  email?: string;
  password?: string;
}

interface MergeIntegrationFormProps {
  domain: string;
  slug?: string;
  profileFields?: ProfileField[];
  config?: MergeConfig;
  onConfigChange?: (config: MergeConfig) => void;
}

export default function MergeIntegrationForm({ domain, slug = '', profileFields = [], config = {}, onConfigChange }: MergeIntegrationFormProps) {
  const { field = '', email = '', password = '' } = config;

  useEffect(() => {
    const defaultEmail = (domain && !email)
      ? `admin+${slug || domain.split('.')[0]}@staffbase.com`
      : email;
    const defaultField = (!field && profileFields.length > 0)
      ? (profileFields.find(f => f.slug === 'publicEmailAddress')?.title || profileFields[0]?.title || '')
      : (field || DEFAULT_WORKDAY_FIELD_TITLE);
    if (defaultEmail !== email || defaultField !== field) {
      onConfigChange?.({ field: defaultField, email: defaultEmail, password });
    }
  // Intentionally omit email, field, onConfigChange, password, slug from deps —
  // adding them would cause an infinite loop since this effect writes those values via onConfigChange
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, profileFields]);

  const set = (patch: Partial<MergeConfig>) => onConfigChange?.({ field, email, password, ...patch });

  const chipStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 11px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    border: `1px solid ${colors.primary}`,
    background: `${colors.primary}18`,
    color: colors.primary,
    userSelect: 'none',
    marginBottom: 12,
  };

  const fieldWrap: React.CSSProperties = { marginBottom: 10 };

  if (!domain) {
    return <p style={{ fontSize: 13, color: colors.textMuted }}>No domain configured.</p>;
  }

  return (
    <div>
      <div style={chipStyle}>
        Workday
      </div>

      {profileFields.length > 0 && (
        <div style={fieldWrap}>
          <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Unique identifier field</label>
          <select
            style={{ ...inputStyle, fontSize: 12 }}
            value={field}
            onChange={e => set({ field: e.target.value })}
          >
            {profileFields.map(f => (
              <option key={f.slug} value={f.title}>{f.title}</option>
            ))}
          </select>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: colors.textMuted }}>
            The Staffbase profile field used to match employees in Workday.
          </p>
        </div>
      )}

      <div style={fieldWrap}>
        <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Staffbase login email</label>
        <input
          type="email"
          style={{ ...inputStyle, fontSize: 12 }}
          value={email}
          onChange={e => set({ email: e.target.value })}
          placeholder="admin+slug@staffbase.com"
        />
      </div>
      <div style={fieldWrap}>
        <label style={{ ...labelStyle, marginBottom: 4, display: 'block' }}>Staffbase login password</label>
        <input
          type="password"
          style={{ ...inputStyle, fontSize: 12 }}
          value={password}
          onChange={e => set({ password: e.target.value })}
          placeholder="Password"
        />
      </div>
    </div>
  );
}
