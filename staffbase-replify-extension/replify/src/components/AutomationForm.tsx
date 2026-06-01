import { useState, useEffect } from "react";
import {
  brandingButtonStyle,
  inputStyle,
  labelStyle as formLabelStyle,
  warningPsaStyle,
  listContainerStyle,
  listRowStyle,
  subtlePanelStyle,
} from "../styles";
import { colors } from '../styles/colors';
import ProgressBar from "./ProgressBar";
import { MdOutlineSettingsSuggest } from "react-icons/md";
import TabValidationBanner from "./TabValidationBanner";

export interface AutomationUser {
  id: string;
  firstName: string;
  lastName: string;
  username?: string;
}

export interface AutomationProgressData {
  tasksCompleted: number;
  totalTasks: number;
  currentUser?: string;
  currentStatus?: string;
}

interface Survey {
  id: string;
  published?: unknown;
  config?: { localization?: { en_US?: { title?: string } } };
}

interface Form {
  id: string;
  published?: unknown;
  config?: { localization?: { en_US?: { title?: string } } };
}

interface Post {
  id: string;
  published?: unknown;
  contents?: { en_US?: { title?: string } };
}

interface AutomationOptions {
  surveys: boolean;
  forms: boolean;
  reactions: boolean;
  comments: boolean;
  chats: boolean;
}

export interface AutomationRunOptions extends AutomationOptions {
  selectedSurveyIds: string[];
  selectedForms: { id: string; name: string }[];
  selectedPostIds: string[];
  useAI: boolean;
  prospectName: string;
  language: string | null;
  locales: string[];
}

interface AutomationFormProps {
  users: AutomationUser[];
  apiToken: string;
  isStaffbaseTab: boolean;
  onRun: (userIds: string[], options: AutomationRunOptions) => void;
  automationRunning: boolean;
  progressData: AutomationProgressData;
  apiDomain?: string;
  availableLocales?: string[];
}

const userListStyle = listContainerStyle;
const userItemStyle = listRowStyle;
const labelStyle: React.CSSProperties = { cursor: "pointer", flex: 1, userSelect: 'none' };
const checkboxContainerStyle: React.CSSProperties = {
  ...subtlePanelStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginBottom: '20px',
};

const AUTOMATION_OPTIONS = [
  { id: 'surveys', label: 'Fill Surveys', timePerUser: 10 },
  { id: 'forms', label: 'Fill Forms', timePerUser: 8 },
  { id: 'reactions', label: 'Add Reactions (10x)', timePerUser: 3 },
  { id: 'comments', label: 'Post and Reply to Comments (2-4x)', timePerUser: 6 },
  { id: 'chats', label: 'Reply to Chats', timePerUser: 6, aiTime: 3 },
] as const;

type AutomationOptionId = typeof AUTOMATION_OPTIONS[number]['id'];

export default function AutomationForm({
  users,
  apiToken,
  isStaffbaseTab,
  onRun,
  automationRunning,
  progressData,
  apiDomain = "app.staffbase.com",
  availableLocales = [],
}: AutomationFormProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [options, setOptions] = useState<AutomationOptions>({
    surveys: true,
    forms: true,
    reactions: true,
    comments: true,
    chats: true,
  });
  const [availableSurveys, setAvailableSurveys] = useState<Survey[]>([]);
  const [selectedSurveyIds, setSelectedSurveyIds] = useState<string[]>([]);
  const [surveysVisible, setSurveysVisible] = useState(false);
  const [availableForms, setAvailableForms] = useState<Form[]>([]);
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>([]);
  const [formsVisible, setFormsVisible] = useState(false);
  const [availablePosts, setAvailablePosts] = useState<Post[]>([]);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [postsVisible, setPostsVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [prospectName, setProspectName] = useState("");
  const [language, setLanguage] = useState<string | null>(null);
  const [isAdvancedHovered, setIsAdvancedHovered] = useState(false);

  useEffect(() => {
    if (!useAI) {
      setProspectName("");
      setLanguage(null);
    }
  }, [useAI]);

  const buildApiUrl = (path: string) => {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `https://${apiDomain}${cleanPath}`;
  };

  useEffect(() => {
    if (!isStaffbaseTab || !apiToken) return;

    const fetchSurveys = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/installations/administrated?pluginID=surveys&limit=-1"), {
          headers: { Authorization: `Basic ${apiToken}` },
        });
        if (!response.ok) { console.error("Failed to fetch surveys"); return; }
        const { data } = await response.json();
        const publishedSurveys: Survey[] = data.filter((s: Survey) => s.published);
        setAvailableSurveys(publishedSurveys);
        setSelectedSurveyIds(publishedSurveys.slice(0, 2).map(s => s.id));
      } catch (error) {
        console.error("Error fetching surveys:", error);
      }
    };

    fetchSurveys();
  // buildApiUrl is a stable pure import — it never changes, so no need to list it as a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaffbaseTab, apiToken]);

  useEffect(() => {
    if (!isStaffbaseTab || !apiToken) return;
    const fetchForms = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/plugins/form/installations/search?permission=manage&query=&limit=100&sort=updated_DESC'), {
          headers: { Authorization: `Basic ${apiToken}` },
        });
        if (!res.ok) return;
        const { entries } = await res.json();
        const published: Form[] = (entries || []).map((e: { data?: Form }) => e.data).filter((f: Form | null) => f && f.published);
        setAvailableForms(published);
        setSelectedFormIds(published.slice(0, 2).map(f => f.id));
      } catch (err) {
        console.error('Error fetching forms:', err);
      }
    };
    fetchForms();
  // buildApiUrl is a stable pure import — it never changes, so no need to list it as a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaffbaseTab, apiToken]);

  useEffect(() => {
    if (!isStaffbaseTab || !apiToken) return;

    const fetchRecentPosts = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/posts?limit=20&sort=published_DESC"), {
          headers: { Authorization: `Basic ${apiToken}` },
        });
        if (!response.ok) { console.error("Failed to fetch recent posts"); return; }
        const { data } = await response.json();
        const publishedPosts: Post[] = data.filter((p: Post) => p.published);
        setAvailablePosts(publishedPosts);
        setSelectedPostIds(publishedPosts.slice(0, 2).map(p => p.id));
      } catch (error) {
        console.error("Error fetching posts:", error);
      }
    };

    fetchRecentPosts();
  // buildApiUrl is a stable pure import — it never changes, so no need to list it as a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaffbaseTab, apiToken]);

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectNext5 = () => {
    const unselectedUsers = users.filter(user => !selectedUserIds.includes(user.id));
    const idsToSelect = unselectedUsers.slice(0, 5).map(user => user.id);
    setSelectedUserIds(prev => [...prev, ...idsToSelect]);
  };

  const handleDeselectLast5 = () => {
    setSelectedUserIds(prev => prev.slice(0, -5));
  };

  const handleOptionChange = (optionId: AutomationOptionId) => {
    setOptions(prev => ({ ...prev, [optionId]: !prev[optionId] }));
  };

  const handleToggleSurvey = (surveyId: string) => {
    setSelectedSurveyIds(prev =>
      prev.includes(surveyId) ? prev.filter(id => id !== surveyId) : [...prev, surveyId]
    );
  };

  const handleSelectAllSurveys = () => {
    if (selectedSurveyIds.length === availableSurveys.length) {
      setSelectedSurveyIds([]);
    } else {
      setSelectedSurveyIds(availableSurveys.map(s => s.id));
    }
  };

  const handleToggleForm = (formId: string) => {
    setSelectedFormIds(prev =>
      prev.includes(formId) ? prev.filter(id => id !== formId) : [...prev, formId]
    );
  };

  const handleSelectAllForms = () => {
    if (selectedFormIds.length === availableForms.length) {
      setSelectedFormIds([]);
    } else {
      setSelectedFormIds(availableForms.map(f => f.id));
    }
  };

  const handleTogglePost = (postId: string) => {
    setSelectedPostIds(prev =>
      prev.includes(postId) ? prev.filter(id => id !== postId) : [...prev, postId]
    );
  };

  const handleSelectAllPosts = () => {
    if (selectedPostIds.length === availablePosts.length) {
      setSelectedPostIds([]);
    } else {
      setSelectedPostIds(availablePosts.map(p => p.id));
    }
  };

  const timeEstimate = (): string => {
    const userCount = selectedUserIds.length;
    if (userCount === 0) return "";

    const totalSecondsPerUser = AUTOMATION_OPTIONS.reduce((acc, option) => {
      if (!options[option.id]) return acc;
      let time = option.timePerUser + (useAI && 'aiTime' in option && option.aiTime ? option.aiTime : 0);
      if (option.id === 'surveys') time *= selectedSurveyIds.length;
      else if (option.id === 'forms') time *= selectedFormIds.length;
      else if (option.id === 'comments') time *= selectedPostIds.length;
      return acc + time;
    }, 0);

    const totalSeconds = totalSecondsPerUser * userCount;
    if (totalSeconds === 0) return "No tasks selected.";

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `Est. time: ${minutes > 0 ? `${minutes}m ` : ''}${seconds > 0 ? `${seconds}s` : ''}`.trim();
  };

  const tabValidation = isStaffbaseTab
    ? { status: 'ok' as const, message: '' }
    : { status: 'error' as const, message: 'You must be on a Staffbase tab (.com, .rocks, or .dev) to run automation.' };

  return (
    <div>
      <h2>Select Users for Automation</h2>
      <TabValidationBanner tabValidation={tabValidation} />
      <p>Select users to include in the automation process.</p>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <button onClick={handleSelectNext5}>Select Next 5</button>
        <button onClick={handleDeselectLast5}>Deselect Last 5</button>
      </div>

      <div style={userListStyle}>
        {users.map((user) => (
          <div key={user.id} style={userItemStyle}>
            <input type="checkbox" id={`user-${user.id}`} checked={selectedUserIds.includes(user.id)} onChange={() => handleToggleUser(user.id)} style={{ marginRight: "12px", cursor: "pointer" }} />
            <label htmlFor={`user-${user.id}`} style={labelStyle}>{`${user.firstName} ${user.lastName} ${user.username ? `(${user.username})` : ""}`.trim()}</label>
          </div>
        ))}
      </div>

      <h2>Select Tasks to Run</h2>

      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        onMouseEnter={() => setIsAdvancedHovered(true)}
        onMouseLeave={() => setIsAdvancedHovered(false)}
        style={{
          background: isAdvancedHovered ? colors.backgroundSubtle : colors.backgroundLight,
          border: `1px solid ${colors.border}`,
          padding: '8px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          justifyContent: 'center',
          marginBottom: '10px',
          transition: 'background-color 0.2s'
        }}
      >
        <MdOutlineSettingsSuggest size={18} color={colors.textMedium} />
        <span style={{ fontSize: '14px', color: colors.textDark, userSelect: 'none' }}>
          {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
        </span>
        {!showAdvanced && (
          <span style={{ fontSize: '11px', color: colors.textMuted, userSelect: 'none' }}>
            — select surveys, forms &amp; posts to comment on
          </span>
        )}
      </button>

      {availableLocales.length > 0 && (
        <div style={{ ...subtlePanelStyle, marginBottom: 10 }}>
          <label style={{ ...formLabelStyle, marginBottom: 6, display: 'block' }}>Chat &amp; comment language</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {availableLocales.map((locale) => {
              const selected = language === locale;
              return (
                <button
                  key={locale}
                  type="button"
                  onClick={() => setLanguage(selected ? null : locale)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 4,
                    border: `1px solid ${selected ? colors.primary : colors.border}`,
                    background: selected ? colors.primary : 'transparent',
                    color: selected ? colors.textOnPrimary : colors.text,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {locale}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: '11px', color: colors.textMuted, margin: '4px 0 0' }}>
            {language ? `All AI content and chat banks will use ${language}.` : 'No language selected — defaults to English.'}
          </p>
        </div>
      )}

      {showAdvanced && (
        <div style={subtlePanelStyle}>
          <input type="checkbox" id="use-ai-toggle" checked={useAI} onChange={() => setUseAI(!useAI)} style={{ marginRight: "10px", cursor: "pointer" }} />
          <label htmlFor="use-ai-toggle" style={{ ...labelStyle, fontSize: '14px' }}>Use AI for Surveys, Comments & Chats</label>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 10px 24px' }}>
            When checked, the script will generate unique content. When unchecked, it will use the built-in random content banks.
          </p>
          {useAI && (
            <>
              <label style={{...formLabelStyle, marginBottom: '5px', marginLeft: '24px'}}>Prospect Name (Optional)</label>
              <input type="text" value={prospectName} onChange={(e) => setProspectName(e.target.value)} style={{...inputStyle, marginLeft: '24px', width: 'calc(100% - 24px)'}} placeholder="e.g., Acme Corporation" />
              <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 10px 24px' }}>If provided, AI-generated content will be tailored as if from an employee of this company, including chats. Otherwise, AI content will be generic but still personalized to the environment.</p>
            </>
          )}
        </div>
      )}

      <div style={checkboxContainerStyle}>
        {AUTOMATION_OPTIONS.map(option => (
          <div key={option.id}>
            <input type="checkbox" id={`option-${option.id}`} checked={options[option.id]} onChange={() => handleOptionChange(option.id)} style={{ marginRight: "12px", cursor: "pointer" }} />
            <label htmlFor={`option-${option.id}`} style={labelStyle}>{option.label}</label>
            {showAdvanced && option.id === 'forms' && options.forms && availableForms.length > 0 && (
              <div style={{ marginLeft: '25px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                  <button onClick={handleSelectAllForms} style={{ fontSize: '11px', padding: '2px 6px', cursor: 'pointer' }}>
                    {selectedFormIds.length === availableForms.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span onClick={() => setFormsVisible(!formsVisible)} style={{ cursor: 'pointer', userSelect: 'none', fontSize: '12px', color: colors.primary }}>
                    {formsVisible ? 'Hide forms' : 'Show forms to fill'} ({selectedFormIds.length}/{availableForms.length})
                  </span>
                </div>
                {formsVisible && (
                  <div style={{ ...userListStyle, maxHeight: '150px' }}>
                    {availableForms.map(form => (
                      <div key={form.id} style={{ ...userItemStyle, padding: '5px' }}>
                        <input
                          type="checkbox"
                          id={`form-${form.id}`}
                          checked={selectedFormIds.includes(form.id)}
                          onChange={() => handleToggleForm(form.id)}
                          style={{ marginRight: '10px', cursor: 'pointer' }}
                        />
                        <label htmlFor={`form-${form.id}`} style={{ ...labelStyle, fontSize: '12px' }}>
                          {form.config?.localization?.en_US?.title || form.id}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {showAdvanced && useAI && (
              <>
                {option.id === 'surveys' && options.surveys && availableSurveys.length > 0 && (
                  <div style={{ marginLeft: '25px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                      <button onClick={handleSelectAllSurveys} style={{ fontSize: '11px', padding: '2px 6px', cursor: 'pointer' }}>
                        {selectedSurveyIds.length === availableSurveys.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <span onClick={() => setSurveysVisible(!surveysVisible)} style={{ cursor: 'pointer', userSelect: 'none', fontSize: '12px', color: colors.primary }}>
                        {surveysVisible ? 'Hide surveys' : 'Show surveys to answer'} ({selectedSurveyIds.length}/{availableSurveys.length})
                      </span>
                    </div>
                    {surveysVisible && (
                      <div style={{ ...userListStyle, maxHeight: '150px' }}>
                        {availableSurveys.map(survey => (
                          <div key={survey.id} style={{...userItemStyle, padding: '5px'}}>
                            <input
                              type="checkbox"
                              id={`survey-${survey.id}`}
                              checked={selectedSurveyIds.includes(survey.id)}
                              onChange={() => handleToggleSurvey(survey.id)}
                              style={{ marginRight: "10px", cursor: "pointer" }} />
                            <label htmlFor={`survey-${survey.id}`} style={{...labelStyle, fontSize: '12px'}}>{survey.config?.localization?.en_US?.title || survey.id}</label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {option.id === 'comments' && options.comments && availablePosts.length > 0 && (
                  <div style={{ marginLeft: '25px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                      <button onClick={handleSelectAllPosts} style={{ fontSize: '11px', padding: '2px 6px', cursor: 'pointer' }}>
                        {selectedPostIds.length === availablePosts.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <span onClick={() => setPostsVisible(!postsVisible)} style={{ cursor: 'pointer', userSelect: 'none', fontSize: '12px', color: colors.primary }}>
                        {postsVisible ? 'Hide posts' : 'Show posts to comment on'} ({selectedPostIds.length}/{availablePosts.length})
                      </span>
                    </div>
                    {postsVisible && (
                      <div style={{ ...userListStyle, maxHeight: '150px' }}>
                        {availablePosts.map(post => (
                          <div key={post.id} style={{...userItemStyle, padding: '5px'}}>
                            <input
                              type="checkbox"
                              id={`post-${post.id}`}
                              checked={selectedPostIds.includes(post.id)}
                              onChange={() => handleTogglePost(post.id)}
                              style={{ marginRight: "10px", cursor: "pointer" }} />
                            <label htmlFor={`post-${post.id}`} style={{...labelStyle, fontSize: '12px'}}>
                              {post.contents?.en_US?.title || post.id}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div style={warningPsaStyle}>
        <strong>Heads up!</strong> This process will open and control a new tab. Please leave the new tab open and stay on this page. You can open another Chrome window to continue working while the automation runs.
        {selectedUserIds.length > 0 && (<div style={{ marginTop: "5px", fontWeight: 'bold' }}>{timeEstimate()}</div>)}
      </div>

      {!showAdvanced && (options.surveys || options.forms || options.comments) && (
        <p style={{ fontSize: '11px', color: colors.textMuted, margin: '-6px 0 8px', fontStyle: 'italic' }}>
          Simple mode: capped at 2 {[options.surveys && 'surveys', options.forms && 'forms', options.comments && 'posts'].filter(Boolean).join(', ')}. Show advanced options to select more.
        </p>
      )}

      <button
        style={brandingButtonStyle}
        onClick={() => {
          const cap = showAdvanced ? Infinity : 2;
          const effectiveSurveyIds = selectedSurveyIds.slice(0, cap);
          const selectedForms = availableForms
            .filter(f => selectedFormIds.includes(f.id))
            .slice(0, cap)
            .map(f => ({ id: f.id, name: f.config?.localization?.en_US?.title || f.id }));
          const effectivePostIds = showAdvanced ? selectedPostIds : selectedPostIds.slice(0, cap);
          onRun(selectedUserIds, { ...options, selectedSurveyIds: effectiveSurveyIds, selectedForms, selectedPostIds: effectivePostIds, useAI, prospectName, language, locales: language ? [language] : [] });
        }}
        disabled={selectedUserIds.length === 0 || !isStaffbaseTab || automationRunning}
      >
        {automationRunning ? 'Running...' : `Run Automation for ${selectedUserIds.length} Users`}
      </button>

      {automationRunning && (
        <ProgressBar
          progressData={progressData}
          initialTimeEstimate={(() => {
            const userBasedTime = AUTOMATION_OPTIONS.reduce((acc, opt) => (options[opt.id] ? acc + opt.timePerUser : acc), 0) * selectedUserIds.length;
            let surveyGenerationTime = 0;
            if (options.surveys) {
              const timePerSurveyGeneration = 15;
              surveyGenerationTime = selectedSurveyIds.length * timePerSurveyGeneration;
            }
            return userBasedTime + surveyGenerationTime;
          })()}
        />
      )}
    </div>
  );
}
