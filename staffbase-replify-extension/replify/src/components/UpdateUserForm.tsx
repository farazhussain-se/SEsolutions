import React from "react";
import { brandingButtonStyle, inputStyle, panelStyle } from "../styles";
import { colors } from '../styles/colors';
import { FaPlus, FaMinus } from "react-icons/fa";

interface FieldUpdate {
  field: string;
  value: string;
}

export interface UpdateUserFormUser {
  id: string;
  firstName: string;
  lastName: string;
  username?: string;
}

export interface UpdateUserFormProfile {
  profile?: Record<string, unknown>;
}

interface UpdateUserFormProps {
  users: UpdateUserFormUser[];
  selectedUserId: string;
  userProfile?: UpdateUserFormProfile | null;
  allProfileFields: string[];
  isLoading: boolean;
  isLoginAsUserLoading: boolean;
  fieldsToUpdate: FieldUpdate[];
  selectedFile?: File | null;
  imageType: 'none' | 'avatar' | 'profileHeaderImage';
  onUserSelect: (id: string) => void;
  onLoginAsUser: () => void;
  onFieldUpdate: (index: number, key: keyof FieldUpdate, value: string) => void;
  onAddField: () => void;
  onRemoveField: (index: number) => void;
  onFileChange: (file: File | null) => void;
  onImageTypeChange: (type: string) => void;
  onProfileUpdate: () => void;
}

const formSectionStyle: React.CSSProperties = { ...panelStyle };

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: "bold",
  marginBottom: "5px",
};

const radioContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '20px',
  marginBottom: '15px',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
  padding: "8px",
};

const removeButtonStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: `1px solid ${colors.borderMedium}`,
  borderRadius: '4px',
  cursor: 'pointer',
  flexShrink: 0,
};

export default function UpdateUserForm({
  users,
  selectedUserId,
  userProfile,
  allProfileFields,
  isLoading,
  isLoginAsUserLoading,
  fieldsToUpdate,
  selectedFile,
  imageType,
  onUserSelect,
  onLoginAsUser,
  onFieldUpdate,
  onAddField,
  onRemoveField,
  onFileChange,
  onImageTypeChange,
  onProfileUpdate,
}: UpdateUserFormProps) {
  const getButtonText = () => {
    const hasTextUpdate = fieldsToUpdate.some(f => f.field && f.value);
    const hasImageUpdate = selectedFile && imageType !== 'none';

    if (hasTextUpdate && hasImageUpdate) {
      return `Update Field${fieldsToUpdate.length > 1 ? 's' : ''} and Image`;
    }
    if (hasTextUpdate) {
      return `Update Profile Field${fieldsToUpdate.length > 1 ? 's' : ''}`;
    }
    if (hasImageUpdate) {
      return `Upload ${imageType === 'avatar' ? 'Avatar' : 'Banner'}`;
    }
    return "Update Profile";
  };

  const selectedUser = users.find((user) => user.id === selectedUserId);

  return (
    <div>
      <h2>Update User Profile</h2>
      <p>Modify profile data and images for the selected user.</p>

      <div style={formSectionStyle}>
        <label style={labelStyle}>Select User</label>
        <select
          id="user-select"
          style={selectStyle}
          value={selectedUserId}
          onChange={(e) => onUserSelect(e.target.value)}
          disabled={isLoading || !users.length}
        >
          <option value="">-- Select a user --</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {`${user.firstName} ${user.lastName} ${user.username ? `(${user.username})` : ""}`.trim()}
            </option>
          ))}
        </select>
        {selectedUser && (
          <div style={{ marginTop: '10px' }}>
            <button
              style={{ ...brandingButtonStyle, width: "100%" }}
              onClick={onLoginAsUser}
              disabled={isLoading}
            >
              {isLoginAsUserLoading ? `Fetching credentials for ${selectedUser.firstName}...` : `Login as ${selectedUser.firstName}`}
            </button>
          </div>
        )}
      </div>

      {selectedUserId && (
        <>
          <div style={{...formSectionStyle, paddingBottom: '5px'}}>
            <label style={labelStyle}>Update Text Fields</label>
            {fieldsToUpdate.map((item, index) => (
              <div
                key={index}
                style={{
                  position: 'relative',
                  border: `1px solid ${colors.backgroundSubtle}`,
                  padding: '15px',
                  borderRadius: '4px',
                  marginBottom: '15px',
                  background: colors.backgroundLight
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <select
                    style={{ ...selectStyle, flexGrow: 1 }}
                    value={item.field}
                    onChange={(e) => onFieldUpdate(index, 'field', e.target.value)}
                    disabled={isLoading || allProfileFields.length === 0}
                  >
                    <option value="">-- Select a field --</option>
                    {allProfileFields.map((field) => (
                      <option key={field} value={field}>{field}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => onRemoveField(index)}
                    disabled={isLoading || fieldsToUpdate.length <= 1}
                    style={removeButtonStyle}
                  >
                    <FaMinus color={fieldsToUpdate.length <= 1 ? colors.border : colors.danger} />
                  </button>
                </div>
                <input
                  type="text"
                  style={{ ...inputStyle, width: '100%' }}
                  value={item.value}
                  onChange={(e) => onFieldUpdate(index, 'value', e.target.value)}
                  placeholder={userProfile?.profile?.[item.field] ? `Current: ${String(userProfile.profile[item.field])}` : "Enter new value"}
                  disabled={isLoading || !item.field}
                />
              </div>
            ))}
            <button
              onClick={onAddField}
              disabled={isLoading}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '5px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                color: colors.primary
              }}
            >
              <FaPlus size={12} /> Add Field
            </button>
          </div>

          <div style={formSectionStyle}>
            <label style={labelStyle}>Update Image</label>
            <div style={radioContainerStyle}>
              <label>
                <input type="radio" name="imageType" value="none" checked={imageType === 'none'} onChange={(e) => onImageTypeChange(e.target.value)} disabled={isLoading}/>
                None
              </label>
              <label><input type="radio" name="imageType" value="avatar" checked={imageType === 'avatar'} onChange={(e) => onImageTypeChange(e.target.value)} disabled={isLoading}/> Avatar</label>
              <label><input type="radio" name="imageType" value="profileHeaderImage" checked={imageType === 'profileHeaderImage'} onChange={(e) => onImageTypeChange(e.target.value)} disabled={isLoading}/> Banner</label>
            </div>
            <input
              id="image-file-input"
              type="file"
              key={selectedFile ? 'file-selected' : 'no-file'}
              accept="image/png, image/jpeg, image/gif"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              disabled={isLoading}
              style={{ display: 'block', width: '100%' }}
            />
          </div>

          <button
            style={{ ...brandingButtonStyle, width: '100%' }}
            onClick={onProfileUpdate}
            disabled={isLoading || (!fieldsToUpdate.some(f => f.field && f.value) && !selectedFile)}
          >
            {isLoading ? "Processing..." : getButtonText()}
          </button>
        </>
      )}
    </div>
  );
}
