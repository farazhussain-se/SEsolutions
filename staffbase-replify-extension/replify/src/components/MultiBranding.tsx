// components/MultiBranding.tsx

import { useState, useMemo, useEffect } from "react";
import { LuCirclePlus, LuTrash2, LuSearch } from "react-icons/lu";
import { formGroupStyle, inputStyle, labelStyle, brandingButtonStyle, checkboxLabelStyle, checkboxStyle } from "../styles";
import { colors } from "../styles/colors";
import SavedProspects, { type Prospect } from "./SavedProspects";

export interface GroupBranding {
  groupId: string;
  groupName?: string;
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  floatingNavBgColor?: string;
  floatingNavTextColor?: string;
  logoUrl?: string;
  bgUrl?: string;
  logoPadWidth?: number;
  logoPadHeight?: number;
  bgVertical?: number;
  changeLogoSize?: boolean;
  logoHeight?: number;
  logoMarginTop?: number;
  headerTransparency?: number;
}

interface Group {
  id: string;
  name: string;
}

interface BrandingConfigFormProps {
  group: GroupBranding;
  onSave: (config: GroupBranding) => void;
  onCancel: () => void;
  existingBrandings?: GroupBranding[];
  savedProspects: Prospect[];
}

const BrandingConfigForm = ({ group, onSave, onCancel, existingBrandings = [], savedProspects }: BrandingConfigFormProps) => {
  const [primaryColor, setPrimaryColor] = useState(group.primaryColor || "#000000");
  const [textColor, setTextColor] = useState(group.textColor || "#ffffff");
  const [backgroundColor, setBackgroundColor] = useState(group.backgroundColor || "#F3F3F3");
  const [floatingNavBgColor, setFloatingNavBgColor] = useState(group.floatingNavBgColor || "#FFFFFF");
  const [floatingNavTextColor, setFloatingNavTextColor] = useState(group.floatingNavTextColor || "#000000");
  const [logoUrl, setLogoUrl] = useState(group.logoUrl || "");
  const [bgUrl, setBgUrl] = useState(group.bgUrl || "");
  const [logoPadWidth, setLogoPadWidth] = useState(group.logoPadWidth || 0);
  const [logoPadHeight, setLogoPadHeight] = useState(group.logoPadHeight || 0);
  const [bgVertical, setBgVertical] = useState(group.bgVertical || 0);
  const [changeLogoSize, setChangeLogoSize] = useState(group.changeLogoSize || false);
  const [logoHeight, setLogoHeight] = useState(group.logoHeight || 100);
  const [logoMarginTop, setLogoMarginTop] = useState(group.logoMarginTop || 0);
  const [headerTransparency, setHeaderTransparency] = useState(group.headerTransparency ?? 70);

  useEffect(() => {
    if (group) {
      setPrimaryColor(group.primaryColor || "#000000");
      setTextColor(group.textColor || "#ffffff");
      setBackgroundColor(group.backgroundColor || "#F3F3F3");
      setFloatingNavBgColor(group.floatingNavBgColor || "#FFFFFF");
      setFloatingNavTextColor(group.floatingNavTextColor || "#000000");
      setLogoUrl(group.logoUrl || "");
      setBgUrl(group.bgUrl || "");
      setLogoPadWidth(group.logoPadWidth || 0);
      setLogoPadHeight(group.logoPadHeight || 0);
      setBgVertical(group.bgVertical || 0);
      setChangeLogoSize(group.changeLogoSize || false);
      setLogoHeight(group.logoHeight || 100);
      setLogoMarginTop(group.logoMarginTop || 0);
      setHeaderTransparency(group.headerTransparency ?? 70);
    }
  }, [group]);

  const handleLoadProspect = (prospect: Prospect) => {
    setPrimaryColor(String(prospect.primaryColor ?? "#000000"));
    setTextColor(String(prospect.textColor ?? "#ffffff"));
    setBackgroundColor(String(prospect.backgroundColor ?? "#F3F3F3"));
    setFloatingNavBgColor(String(prospect.floatingNavBgColor ?? "#FFFFFF"));
    setFloatingNavTextColor(String(prospect.floatingNavTextColor ?? "#000000"));
    setLogoUrl(String(prospect.logoUrl ?? ""));
    setBgUrl(String(prospect.bgUrl ?? ""));
    setLogoPadWidth(Number(prospect.logoPadWidth ?? 0));
    setLogoPadHeight(Number(prospect.logoPadHeight ?? 0));
    setBgVertical(Number(prospect.bgVertical ?? 0));
    setChangeLogoSize(Boolean(prospect.changeLogoSize ?? false));
    setLogoHeight(Number(prospect.logoHeight ?? 100));
    setLogoMarginTop(Number(prospect.logoMarginTop ?? 0));
    setHeaderTransparency(Number(prospect.headerTransparency ?? 70));
  };

  const handleSave = () => {
    onSave({
      groupId: group.groupId,
      groupName: group.groupName,
      primaryColor,
      textColor,
      backgroundColor,
      floatingNavBgColor,
      floatingNavTextColor,
      logoUrl,
      bgUrl,
      logoPadWidth,
      logoPadHeight,
      bgVertical,
      changeLogoSize,
      logoHeight,
      logoMarginTop,
      headerTransparency,
    });
  };

  return (
    <div style={{ border: `1px solid ${colors.border}`, padding: '15px', borderRadius: '4px', marginTop: '10px', background: colors.backgroundLight }}>
      <h4 style={{ margin: '0 0 15px 0' }}>{existingBrandings.some(b => b.groupId === group.groupId) ? 'Editing' : 'Adding'} Branding for: <strong>{group.groupName || group.groupId}</strong></h4>

      <SavedProspects prospects={savedProspects} onSelect={handleLoadProspect} />

      <div style={formGroupStyle}>
        <h5 style={{ textAlign: 'center', margin: '0 0 10px 0', color: colors.textMedium, fontWeight: 'bold' }}>Main Branding</h5>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {([
            ['Primary', primaryColor, setPrimaryColor],
            ['Text', textColor, setTextColor],
            ['Background', backgroundColor, setBackgroundColor],
          ] as [string, string, (v: string) => void][]).map(([lbl, val, setter]) => (
            <div key={lbl} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <label style={{ ...labelStyle, marginBottom: '4px', fontWeight: 'normal' }}>{lbl}</label>
              <input
                type="color"
                style={{ ...inputStyle, padding: 0, width: 50, height: 50, border: 'none', cursor: 'pointer' }}
                value={val}
                onChange={(e) => setter(e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={formGroupStyle}>
        <h5 style={{ textAlign: 'center', margin: '10px 0 10px 0', color: colors.textMedium, fontWeight: 'bold' }}>Floating Navigation</h5>
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '0 20%' }}>
          {([
            ['Background', floatingNavBgColor, setFloatingNavBgColor],
            ['Text', floatingNavTextColor, setFloatingNavTextColor],
          ] as [string, string, (v: string) => void][]).map(([lbl, val, setter]) => (
            <div key={lbl} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <label style={{ ...labelStyle, marginBottom: '4px', fontWeight: 'normal' }}>{lbl}</label>
              <input
                type="color"
                style={{ ...inputStyle, padding: 0, width: 50, height: 50, border: 'none', cursor: 'pointer' }}
                value={val}
                onChange={(e) => setter(e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{...formGroupStyle, marginTop: '15px'}}>
        <label style={labelStyle}>Logo URL (Optional):</label>
        <input type="text" style={inputStyle} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
      </div>
      <div style={formGroupStyle}>
        <label style={labelStyle}>Background Image URL (Optional):</label>
        <input type="text" style={inputStyle} value={bgUrl} onChange={(e) => setBgUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
        <div style={{flex: 1}}>
          <label style={labelStyle}>Logo Padding (W x H)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" style={{ ...inputStyle, width: '100%' }} value={logoPadWidth} onChange={(e) => setLogoPadWidth(Number(e.target.value))} />
            <input type="number" style={{ ...inputStyle, width: '100%' }} value={logoPadHeight} onChange={(e) => setLogoPadHeight(Number(e.target.value))} />
          </div>
        </div>
        <div style={{flex: 1}}>
          <label style={labelStyle}>BG Vertical %</label>
          <input type="number" min="-50" max="50" style={{ ...inputStyle, width: '100%' }} value={bgVertical} onChange={(e) => setBgVertical(Number(e.target.value))} />
        </div>
        <div style={{flex: 1}}>
          <label style={labelStyle}>Header Transparency</label>
          <input type="range" min="0" max="100" style={{ ...inputStyle, width: '100%', padding: 0 }} value={headerTransparency} onChange={(e) => setHeaderTransparency(Number(e.target.value))} />
        </div>
      </div>

      <div style={{ ...formGroupStyle, marginTop: '15px' }}>
        <label style={{ ...checkboxLabelStyle, justifyContent: 'flex-start' }}>
          <input
            type="checkbox"
            style={{...checkboxStyle, marginRight: '8px'}}
            checked={changeLogoSize}
            onChange={(e) => setChangeLogoSize(e.target.checked)}
          />
          Customize logo size/position
        </label>
      </div>

      {changeLogoSize && (
        <div style={{ display: 'flex', gap: '15px', paddingLeft: '20px' }}>
          <div style={{flex: 1}}>
            <label style={labelStyle}>Logo Height (px)</label>
            <input type="number" style={{ ...inputStyle, width: '100%' }} value={logoHeight} onChange={(e) => setLogoHeight(Number(e.target.value))} />
          </div>
          <div style={{flex: 1}}>
            <label style={labelStyle}>Logo Margin Top (px)</label>
            <input type="number" style={{ ...inputStyle, width: '100%' }} value={logoMarginTop} onChange={(e) => setLogoMarginTop(Number(e.target.value))} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
        <button onClick={onCancel} style={{ ...brandingButtonStyle, background: colors.border }}>Cancel</button>
        <button onClick={handleSave} style={brandingButtonStyle}>Save Branding</button>
      </div>
    </div>
  );
};

interface MultiBrandingProps {
  apiToken?: string;
  branchId?: string;
  brandings: GroupBranding[];
  onAdd: (branding: GroupBranding) => void;
  onUpdate: (branding: GroupBranding) => void;
  onRemove: (groupId: string) => void;
  allGroups: Group[];
  savedProspects: Prospect[];
}

export default function MultiBranding({ allGroups, brandings, onAdd, onUpdate, onRemove, savedProspects }: MultiBrandingProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupBranding | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const handleSave = (config: GroupBranding) => {
    const configToSave = { ...config, groupName: config.groupName || config.groupId };
    const isEditing = brandings.some(b => b.groupId === configToSave.groupId);
    if (isEditing) { onUpdate(configToSave); }
    else { onAdd(configToSave); }
    setShowForm(false);
    setEditingGroup(null);
  };

  const handleEdit = (branding: GroupBranding) => {
    setEditingGroup(branding);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditingGroup(null);
    setShowForm(true);
    setSearchTerm("");
  };

  const filteredAndAvailableGroups = useMemo(() => {
    const brandedGroupIds = brandings.map(b => b.groupId);
    return allGroups
      .filter(g => !brandedGroupIds.includes(g.id))
      .filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allGroups, brandings, searchTerm]);

  return (
    <div style={{ padding: "15px", border: `1px solid ${colors.border}`, borderRadius: "4px", marginTop: "20px", marginBottom: "10px" }}>
      <h3 style={{ marginTop: 0, borderBottom: `1px solid ${colors.border}`, paddingBottom: '10px' }}>Multi-Branding Configurations</h3>

      {brandings.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {brandings.map(branding => (
            <li key={branding.groupId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
              <div>
                <strong style={{ color: colors.primary }}>{branding.groupName}</strong>
                <div style={{ fontSize: '12px', color: colors.textMuted, display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                  <span>Primary: <span style={{display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', background: branding.primaryColor || 'transparent', verticalAlign: 'middle', border: `1px solid ${colors.border}` }}></span> {branding.primaryColor}</span>
                  {branding.logoUrl && <span>Has Logo ✅</span>}
                </div>
              </div>
              <div style={{display: 'flex', gap: '10px'}}>
                <button onClick={() => handleEdit(branding)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.primary }}>Edit</button>
                <button onClick={() => onRemove(branding.groupId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }}>
                  <LuTrash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {brandings.length === 0 && !showForm && <p style={{color: colors.textMuted, textAlign: 'center', margin: '20px 0'}}>No multi-branding configurations added yet.</p>}

      {showForm ? (
        editingGroup ? (
          <BrandingConfigForm group={editingGroup} onSave={handleSave} onCancel={() => { setShowForm(false); setEditingGroup(null); }} existingBrandings={brandings} savedProspects={savedProspects} />
        ) : (
          <div style={{ marginTop: '20px' }}>
            <div>
              <label style={labelStyle}>Select a Group to Brand:</label>
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <LuSearch size={18} style={{ position: 'absolute', top: '12px', left: '10px', color: colors.textMuted }} />
                <input
                  type="text"
                  style={{...inputStyle, paddingLeft: '35px'}}
                  placeholder={`Search through ${filteredAndAvailableGroups.length} available groups...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: `1px solid ${colors.border}`, borderRadius: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                {filteredAndAvailableGroups.map((g, index) => (
                  <li
                    key={g.id}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: index === filteredAndAvailableGroups.length - 1 ? 'none' : `1px solid ${colors.borderLight}`}}
                    onClick={() => setEditingGroup({ groupId: g.id, groupName: g.name })}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = colors.primaryLight)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {g.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      ) : (
        <button onClick={handleAddNew} style={{...brandingButtonStyle, width: '100%', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <LuCirclePlus size={18} /> Add New Group Branding
        </button>
      )}
    </div>
  );
}
