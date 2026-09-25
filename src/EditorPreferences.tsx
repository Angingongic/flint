import { usePreference } from "./preferences";
function Toggle({name,label,description,fallback=true}:{name:string;label:string;description:string;fallback?:boolean}){
  const [value,setValue]=usePreference<boolean>(name,fallback);
  return <label className="panel setting"><span><b>{label}</b><p>{description}</p></span><input type="checkbox" checked={value} onChange={event=>setValue(event.target.checked)}/></label>;
}
export function EditorPreferences(){return <><h2>Editor</h2><Toggle name="live-math" label="Live Smart Math" description="Render math inside card and table fields while you type."/><Toggle name="math-suggestions" label="Local answer suggestions" description="Offer deterministic math answers. Nothing is sent to the cloud."/><Toggle name="spellcheck" label="Spellcheck" description="Use the desktop webview's spellcheck in card text fields."/><p className="muted">New-set drafts are saved automatically on this device.</p></>;}
export function StudyPreferences(){
  const [size,setSize]=usePreference<number>("study-size",100);
  const shuffleToggle=<Toggle name="shuffle-new" fallback={false} label="Shuffle new sessions" description="Randomize new Flashcards and Learn sessions. Resumed Learn sessions keep their saved order."/>;
  return <><h2>Studying</h2>{shuffleToggle}<Toggle name="audio-autoplay" label="Audio autoplay" description="Play card audio automatically when its study side is active."/><label className="panel setting"><span><b>Study text size</b><p>Applies to Flashcards, Learn and Test.</p></span><select value={size} onChange={event=>setSize(Number(event.target.value))}><option value={100}>Standard</option><option value={115}>Large</option><option value={130}>Extra large</option></select></label></>;
}
export function AccessibilityPreferences(){return <><h2>Accessibility</h2><Toggle name="reduced-motion" fallback={false} label="Reduced motion" description="Minimize animation. Your operating-system preference is always respected."/><Toggle name="high-contrast" fallback={false} label="High contrast" description="Increase borders and keyboard-focus contrast."/></>;}
