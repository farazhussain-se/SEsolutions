
// This script is injected into browser tabs by the Chrome extension.
// TypeScript 6 has a known issue resolving chrome.runtime namespace as a value;
// chromeSend() below works around it with a single eslint-disable.

// --- Shared types ---

interface AutomationUser {
    id: string;
    firstName?: string;
    lastName?: string;
    emails?: { primary?: boolean; value: string }[];
}

interface SurveyQuestion {
    id: string;
    questionType: string;
    maxScale?: number;
    content?: { en_US?: { options?: { id: string }[] } };
}

interface SurveyData {
    id: string;
    config?: { localization?: { en_US?: { title?: string } } };
    links?: { frontend_forward?: { href: string } };
    questions?: SurveyQuestion[];
    [key: string]: unknown;
}

interface ChatPair {
    initiator: ((name: string) => string) | string;
    reply: string;
}

interface PendingReply {
    parentId: string;
    replyText: string;
    authorId: string;
}

interface PendingChat {
    recipientId: string;
    initiatorId: string;
    replyText: string;
}

interface ProgressUpdate {
    increment?: boolean;
    status?: string | null;
    user?: string | null;
}

type UpdateProgressFn = (args: ProgressUpdate) => void;

interface FormField {
    type: string;
    optionLabels?: unknown[];
}

interface FormSchema {
    version_no?: number;
    formTranslations?: {
        en_US?: {
            options?: { fields?: Record<string, FormField> };
            schema?: { properties?: Record<string, { enum?: unknown[] }> };
        };
    };
}

type PostCommentsMap = Record<string, {
    comment_reply_pairs?: { parent: string; reply: string }[];
    standalone_comments?: string[];
}>;

interface AutomationOptions {
    surveys?: boolean;
    useAI?: boolean;
    selectedSurveyIds?: string[];
    preGeneratedSurveyAnswers?: Record<string, Record<string, unknown>[]>;
    comments?: boolean;
    selectedPostIds?: string[];
    preGeneratedComments?: PostCommentsMap;
    chats?: boolean;
    preGeneratedChatPairs?: ChatPair[];
    prospectName?: string;
    forms?: boolean;
    selectedForms?: { id: string; name: string; version?: number }[];
    preGeneratedFormAnswers?: Record<string, Record<string, unknown>[]>;
    reactions?: boolean;
    locales?: string[];
    chatMode?: string;
    chatCount?: number;
}

export function automationScript(
    users: AutomationUser[],
    _apiToken: string,
    initialAdminId: string,
    options: AutomationOptions,
    _geminiProxyUrl: string,
    _apiDomain: string,
    sharedDemoPassword: string
) {
    // Note: _geminiProxyUrl is no longer used here — all Gemini calls happen in the extension context before this script is injected.
    let adminId = initialAdminId;
    const hasPreGeneratedComments = Object.prototype.hasOwnProperty.call(options || {}, 'preGeneratedComments');
    const preGeneratedComments: PostCommentsMap | null = hasPreGeneratedComments ? (options.preGeneratedComments || null) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeSend = (msg: Record<string, unknown>) => (chrome as any).runtime?.sendMessage(msg);

    const logger = {
        _log(icon: string, color: string, message: string, details?: unknown) {
            console.log(`%c${icon} ${message}`, `color: ${color}; font-weight: bold;`);
            if (details) console.log(details);
        },
        info(message: string, details?: unknown) { this._log('⏳', '#6495ED', message, details); },
        success(message: string, details?: unknown) { this._log('✅', '#32CD32', message, details); },
        warn(message: string, details?: unknown) { this._log('⚠️', '#FFD700', message, details); },
        error(message: string, error?: unknown) {
            console.error(`%c❌ ${message}`, 'color: #DC143C; font-size: 14px; font-weight: bold;');
            if (error) console.error(error);
        },
        section(title: string) { console.log(`\n%c--- ${title} ---`, 'color: #8A2BE2; font-weight: bold; text-transform: uppercase;'); },
        user(userName: string) { console.log(`\n%c--- Processing User: ${userName} ---`, 'color: #008B8B; font-weight: bold; font-size: 1.1em;'); }
    };

    // --- Helper Functions & Constants ---
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    function getUniqueRandomItem<T>(availableItems: T[], masterList: T[]): T {
        if (availableItems.length === 0) {
            logger.info(`♻️ Refilling content bank from master list of size ${masterList.length}.`);
            Array.prototype.push.apply(availableItems, masterList);
        }
        const randomIndex = Math.floor(Math.random() * availableItems.length);
        const [item] = availableItems.splice(randomIndex, 1);
        return item;
    }

    async function pollForJwtInStorage(surveyId: string, timeout = 10000): Promise<string> {
        const startTime = Date.now();
        logger.info(`Polling local storage for JWT for survey ${surveyId}...`);
        while (Date.now() - startTime < timeout) {
            const data = await chrome.storage.local.get(surveyId);
            if (data && data[surveyId]) {
                await chrome.storage.local.remove(surveyId);
                logger.success(`Found JWT in storage for survey ${surveyId}.`);
                return data[surveyId] as string;
            }
            await sleep(250);
        }
        throw new Error(`Timeout polling storage for JWT for survey ${surveyId}.`);
    }

    const getFreshCsrfToken = async (): Promise<string> => {
        logger.info("Fetching a fresh CSRF token from /auth/discover...");
        try {
            const response = await fetch('/auth/discover', {
                method: 'GET',
                headers: { 'Accept': 'application/vnd.staffbase.auth.discovery.v2+json', 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`API returned status: ${response.status}`);
            const discoveryData = await response.json() as Record<string, unknown>;
            const token = discoveryData?.csrfToken;
            if (token) {
                logger.success("Successfully fetched new CSRF token.");
                return token as string;
            }
            throw new Error("Could not find 'csrfToken' in the API response.");
        } catch (error) {
            logger.error("Failed to get a fresh CSRF token.", error);
            throw error;
        }
    };

    const getRandomItem = <T>(array: T[] | undefined | null): T | null =>
        !array || array.length === 0 ? null : array[Math.floor(Math.random() * array.length)];
    const getRandomInt = (min: number, max: number): number =>
        Math.floor(Math.random() * (max - min + 1)) + min;

    // --- MASTER Content Banks (Originals) ---
    const MASTER_REACTION_TYPES = ['LIKE', 'CELEBRATE', 'SUPPORT', 'INSIGHTFUL', 'THANKS'];
    const MASTER_CHAT_MESSAGE_PAIRS: ChatPair[] = [ { initiator: (_name) => `Hey ${_name}, just a heads up that your shift starts in about an hour. See you soon!`, reply: "Got it, thanks for the reminder! I'm on my way." }, { initiator: (_name) => `Hi ${_name}, could you double-check the inventory report when you get a chance? I think there might be a discrepancy.`, reply: "Sure thing, I'll take a look at it now and let you know what I find." }, { initiator: (_name) => `Hey, Emily's birthday is next week! I was thinking we could all pitch in for a cake. Let me know if you're in.`, reply: "Great idea! I'm definitely in for the cake." }, { initiator: (_name) => `Quick question, ${_name} - do you have the final specs for the Q3 project proposal?`, reply: "Yes, I just got them this morning. I'll forward the email to you right now." }, { initiator: (_name) => `Friendly reminder that our weekly team sync is tomorrow at 10 AM.`, reply: "Thanks! I have it on my calendar." }, { initiator: (_name) => `Are you free for a quick call this afternoon, ${_name}? I'd like to go over the launch plan.`, reply: "Yep, my calendar is open after 2 PM. Just send an invite." }, { initiator: (_name) => `Did you get a chance to see the latest client feedback on the mockups?`, reply: "Not yet, just logged on. I'll check my email now. Hopefully it's good news!" }, { initiator: (_name) => `I'm a little stuck on the data analysis for the monthly report. Do you have a moment to look at my spreadsheet, ${_name}?`, reply: "Of course, happy to help. Share the link with me whenever you're ready." }, { initiator: (_name) => `Up for grabbing lunch today? I'm thinking about that new sandwich shop.`, reply: "I could eat. What time were you thinking?" }, { initiator: (_name) => `Huge congrats on the successful presentation, ${_name}! You absolutely nailed it.`, reply: "Thanks so much! That really means a lot." }, { initiator: (_name) => `How was your weekend, ${_name}?`, reply: "It was great, thanks for asking! Just relaxed. How about yours?" }, { initiator: (_name) => `${_name}, would you be able to cover the first hour of my Friday shift? Something unexpected came up.`, reply: "I think so, but let me double-check my schedule and I'll confirm with you in a few minutes." }, { initiator: (_name) => `Just a heads-up, all expense reports for last month are due by end of day today.`, reply: "Whoops, almost forgot! Appreciate the reminder, I'll get that submitted now." }, { initiator: (_name) => `Is anyone else having trouble connecting to the VPN this morning?`, reply: "Yeah, it's been really slow for me too. I was just about to file a ticket with IT." }, { initiator: (_name) => `Great job on closing that deal, ${_name}! The whole team is celebrating.`, reply: "Thank you! It was a team effort for sure." } ];
    const MASTER_PARENT_REPLY_PAIRS = [ { parent: "Could we get more details on the process for this?", reply: "I would like to second this! More detail would be great." }, { parent: "Is there a deadline for providing feedback on this?", reply: "Good question, I was wondering the same thing." }, { parent: "This looks promising. Who is the main point of contact for questions?", reply: "Thanks for asking, I'd also like to know who to reach out to." }, { parent: "Will there be a follow-up session or Q&A about this topic?", reply: "A Q&A session would be incredibly helpful." }, { parent: "Can you share the presentation slides from the meeting?", reply: "Yes, please! I'd love to review the slides." }, { parent: "What are the key metrics for success on this project?", reply: "Understanding the success metrics would provide a lot of clarity." }, { parent: "Is the documentation for this available on the company intranet?", reply: "A direct link to the documentation would be perfect." }, { parent: "This is a great initiative! How can other teams get involved?", reply: "My team would be very interested in contributing as well." }, { parent: "What was the biggest challenge the team faced during this rollout?", reply: "I'm curious about the lessons learned from this process." }, { parent: "Are there any plans to expand this program to other departments?", reply: "That's a great question; our team would be very interested." } ];
    const MASTER_SINGLE_COMMENTS = [ "This is fantastic news!", "Thank you for the clear and concise update.", "Great work, everyone involved!", "Looking forward to the positive impact this will have.", "Appreciate the transparency.", "This is a huge step forward for us.", "Excellent communication on this matter.", "Very well explained.", "Excited to see this in action.", "Thanks for keeping us in the loop.", "This aligns perfectly with our company goals.", "Incredibly helpful, thank you.", "A much-needed improvement.", "The team has done an outstanding job.", "This will definitely streamline our workflow.", "Kudos to the project team!", "So glad to see this being implemented.", "This makes a lot of sense.", "Simple, effective, and user-friendly. Great job!", "Can't wait to start using this.", "This is a game-changer.", "Well done on a successful launch.", "The results speak for themselves.", "Thrilled with this announcement.", "This is exactly what we needed.", "Informative and to the point.", "Big congratulations to the team!", "This is going to make a big difference.", "A welcome development.", "Really impressive work." ];
    const MASTER_SURVEY_COMMENT_BANK = [ "Very clear and helpful, thank you!", "This was great, no complaints from me.", "Excellent initiative.", "I'm really happy with this.", "Keep up the great work!", "Very satisfied with the process.", "The communication was fantastic.", "This exceeded my expectations.", "Found this very valuable.", "A positive experience all around.", "Well organized and efficient.", "No issues, everything went smoothly.", "This is a welcome change.", "I appreciate the effort that went into this.", "Very user-friendly.", "It was adequate for my needs.", "No strong feelings either way.", "The process was straightforward.", "It served its purpose.", "This is a good starting point.", "Looking forward to see how this develops.", "The information provided was sufficient.", "An interesting approach.", "I was able to complete it without issues.", "Standard procedure, nothing to add.", "As expected.", "It worked.", "Could use a bit more insight on the metrics.", "The instructions could have been clearer.", "I think there's room for improvement here.", "Felt a bit rushed.", "Would be nice to have more context.", "The platform was a little slow at times.", "Some of the questions were a bit ambiguous.", "Hopefully, the next iteration will be more refined.", "A few minor usability issues.", "It was okay, but not amazing.", "More detailed follow-up would be appreciated.", "Could be more engaging." ];

    // --- AVAILABLE Content Banks (Mutable copies for unique selection) ---

    // Localized chat banks
    const LOCALIZED_CHAT_PAIRS: Record<string, ChatPair[]> = {
      es_ES: [
        { initiator: (_name) => `¡Hola ${_name}! Solo un recordatorio: tu turno empieza en una hora. ¡Hasta pronto!`, reply: '¡Entendido, gracias por avisar! Ya voy de camino.' },
        { initiator: (_name) => `Hola ${_name}, ¿podrías revisar el informe de inventario cuando puedas? Creo que hay una discrepancia.`, reply: 'Claro, lo reviso ahora mismo y te comento lo que encuentro.' },
        { initiator: (_name) => `El cumpleaños de Elena es la semana que viene. ¿Te apuntas para entre todos regalarle algo?`, reply: '¡Claro que sí! Cuenta conmigo.' },
        { initiator: (_name) => `Una pregunta rápida, ${_name}: ¿tienes las especificaciones definitivas de la propuesta del Q3?`, reply: 'Sí, las recibí esta mañana. Te reenvío el correo ahora.' },
        { initiator: (_name) => `Recordatorio: mañana a las 10 h tenemos la sincronía semanal del equipo.`, reply: '¡Gracias! Ya lo tengo en el calendario.' },
        { initiator: (_name) => `¿Tienes un momento esta tarde para una llamada rápida, ${_name}? Me gustaría repasar el plan de lanzamiento.`, reply: 'Sí, después de las 14 h tengo hueco. Mándame una invitación.' },
        { initiator: (_name) => `¿Has visto ya los últimos comentarios del cliente sobre los mockups?`, reply: 'Todavía no, acabo de entrar. Reviso el correo ahora. ¡Esperemos buenas noticias!' },
        { initiator: (_name) => `Estoy atascada con el análisis de datos del informe mensual. ¿Puedes echarme un vistazo a la hoja, ${_name}?`, reply: 'Por supuesto, con mucho gusto. Comparte el enlace cuando quieras.' },
        { initiator: (_name) => `¿Te apetece comer hoy? Estaba pensando en ese nuevo bar de bocadillos.`, reply: 'Me parece bien. ¿A qué hora quedamos?' },
        { initiator: (_name) => `¡Enhorabuena por la presentación, ${_name}! Lo has bordado.`, reply: '¡Muchas gracias! Me alegra muchísimo escucharlo.' },
        { initiator: (_name) => `¿Qué tal el fin de semana, ${_name}?`, reply: '¡Muy bien, gracias! Descansé bastante. ¿Y el tuyo?' },
        { initiator: (_name) => `${_name}, ¿podrías cubrirme la primera hora del turno del viernes? Ha surgido algo inesperado.`, reply: 'Creo que sí. Déjame comprobar mi agenda y te confirmo en unos minutos.' },
        { initiator: (_name) => `Aviso: los informes de gastos del mes pasado deben entregarse hoy antes de fin de jornada.`, reply: '¡Uy, casi se me pasa! Gracias por el aviso, lo envío ahora mismo.' },
        { initiator: (_name) => `¿A alguien más le está fallando la VPN esta mañana?`, reply: 'A mí también va muy lenta. Iba a abrir un ticket con IT.' },
        { initiator: (_name) => `¡Épico cierre de trato, ${_name}! Todo el equipo está celebrándolo.`, reply: 'Muchas gracias. Ha sido un trabajo en equipo, sin duda.' },
      ],
      de_DE: [
        { initiator: (_name) => `Hey ${_name}, nur zur Info: deine Schicht beginnt in etwa einer Stunde. Bis gleich!`, reply: 'Alles klar, danke für den Hinweis! Ich bin schon unterwegs.' },
        { initiator: (_name) => `Hallo ${_name}, könntest du den Inventurbericht prüfen, wenn du Zeit hast? Ich glaube, da stimmt etwas nicht.`, reply: 'Klar, ich schau es mir gleich an und gebe dir Bescheid.' },
        { initiator: (_name) => `Emilys Geburtstag ist nächste Woche! Ich dachte, wir könnten alle für einen Kuchen zusammenlegen. Bist du dabei?`, reply: 'Tolle Idee! Ich bin auf jeden Fall dabei.' },
        { initiator: (_name) => `Kurze Frage, ${_name}: Hast du die finalen Spezifikationen für den Q3-Projektvorschlag?`, reply: 'Ja, die habe ich heute Morgen bekommen. Ich leite dir die E-Mail gleich weiter.' },
        { initiator: (_name) => `Erinnerung: Unser wöchentliches Team-Meeting ist morgen um 10 Uhr.`, reply: 'Danke! Steht schon in meinem Kalender.' },
        { initiator: (_name) => `Hast du heute Nachmittag kurz Zeit für einen Anruf, ${_name}? Ich würde gern den Startplan besprechen.`, reply: 'Ja, nach 14 Uhr bin ich frei. Schick mir einfach eine Einladung.' },
        { initiator: (_name) => `Hast du schon das neueste Kundenfeedback zu den Mockups gesehen?`, reply: 'Noch nicht, ich habe gerade erst eingeloggt. Ich schau gleich in meine E-Mails. Hoffentlich gute Neuigkeiten!' },
        { initiator: (_name) => `Ich komme bei der Datenanalyse für den Monatsbericht nicht weiter. Hast du kurz Zeit, dir meine Tabelle anzuschauen, ${_name}?`, reply: 'Natürlich, sehr gerne. Schick mir einfach den Link, wenn du möchtest.' },
        { initiator: (_name) => `Hast du Lust, heute Mittag zu essen? Ich dachte an das neue Sandwich-Café.`, reply: 'Gerne! Wann hast du dir gedacht?' },
        { initiator: (_name) => `Herzlichen Glückwunsch zur erfolgreichen Präsentation, ${_name}! Du hast das wirklich super gemacht.`, reply: 'Vielen Dank! Das bedeutet mir sehr viel.' },
        { initiator: (_name) => `Wie war dein Wochenende, ${_name}?`, reply: 'Super, danke der Nachfrage! Einfach mal ausgeruht. Und deins?' },
        { initiator: (_name) => `${_name}, könntest du die erste Stunde meiner Freitagsschicht übernehmen? Etwas Unvorhergesehenes ist dazwischengekommen.`, reply: 'Ich glaube schon, aber lass mich kurz meinen Kalender prüfen und dann melde ich mich.' },
        { initiator: (_name) => `Kurze Info: Alle Spesenberichte für letzten Monat müssen heute noch eingereicht werden.`, reply: 'Huch, fast vergessen! Danke für den Hinweis, ich reiche das gleich ein.' },
        { initiator: (_name) => `Hat heute Morgen jemand anderes Probleme mit dem VPN?`, reply: 'Ja, bei mir ist es auch sehr langsam. Ich wollte gerade ein Ticket bei der IT einreichen.' },
        { initiator: (_name) => `Super Abschluss, ${_name}! Das ganze Team feiert mit dir.`, reply: 'Vielen Dank! Das war wirklich Teamarbeit.' },
      ],
      fr_FR: [
        { initiator: (_name) => `Bonjour ${_name}, juste un rappel : ton poste commence dans environ une heure. À tout de suite !`, reply: 'Bien reçu, merci pour le rappel ! J\'arrive.' },
        { initiator: (_name) => `Salut ${_name}, tu pourrais jeter un œil au rapport d'inventaire quand tu as un moment ? Je crois qu'il y a une erreur.`, reply: 'Bien sûr, je regarde ça maintenant et je te tiens au courant.' },
        { initiator: (_name) => `C'est le birthday d'Emily la semaine prochaine ! Je pensais qu'on pourrait tous cotiser pour un gâteau. Tu en es ?`, reply: 'Bonne idée ! Je suis partant(e) pour le gâteau.' },
        { initiator: (_name) => `Question rapide, ${_name} — tu as les specs définitives pour la proposition du projet Q3 ?`, reply: 'Oui, je les ai reçues ce matin. Je te transfère le mail de suite.' },
        { initiator: (_name) => `Rappel : notre réunion d'équipe hebdo est demain à 10h.`, reply: 'Merci ! Je l\'ai bien noté dans mon agenda.' },
        { initiator: (_name) => `Tu aurais un moment cet après-midi pour un rapide appel, ${_name} ? J'aimerais revoir le plan de lancement.`, reply: 'Oui, je suis dispo après 14h. Envoie-moi une invitation.' },
        { initiator: (_name) => `Tu as vu les derniers retours client sur les maquettes ?`, reply: 'Pas encore, je viens juste de me connecter. Je regarde mes mails maintenant. On croise les doigts !' },
        { initiator: (_name) => `Je suis un peu bloqué(e) sur l'analyse de données pour le rapport mensuel. Tu pourrais jeter un œil à mon tableau, ${_name} ?`, reply: 'Avec plaisir ! Envoie-moi le lien quand tu veux.' },
        { initiator: (_name) => `Tu déjeunes avec moi aujourd'hui ? Je pensais au nouveau troquet à sandwichs.`, reply: 'Pourquoi pas ! Tu penses à quelle heure ?' },
        { initiator: (_name) => `Félicitations pour la présentation, ${_name} ! Tu l'as vraiment assuré(e).`, reply: 'Merci beaucoup ! Ça me touche vraiment.' },
        { initiator: (_name) => `Comment s'est passé ton week-end, ${_name} ?`, reply: 'Super, merci ! J\'ai bien décroché. Et le tien ?' },
        { initiator: (_name) => `${_name}, tu pourrais me couvrir la première heure du vendredi ? Quelque chose d'imprévu s'est présenté.`, reply: 'Je pense que oui, laisse-moi vérifier mon planning et je te confirme dans quelques minutes.' },
        { initiator: (_name) => `Info : les notes de frais du mois dernier doivent être soumises aujourd'hui avant la fin de journée.`, reply: 'Oups, j\'avais failli oublier ! Merci pour le rappel, je les envoie de suite.' },
        { initiator: (_name) => `Quelqu'un d'autre a des problèmes de VPN ce matin ?`, reply: 'Oui, ça rame vraiment chez moi aussi. J\'allais justement ouvrir un ticket IT.' },
        { initiator: (_name) => `Bravo pour ce contrat signé, ${_name} ! Toute l'équipe est en fête.`, reply: 'Merci ! C\'était vraiment un travail d\'équipe.' },
      ],
      ja_JP: [
        { initiator: (_name) => `${_name}さん、もうすぐシフト開始の1時間前です。気をつけて来てください！`, reply: 'わかりました、知らせてくれてありがとう！もう向かっています。' },
        { initiator: (_name) => `${_name}さん、時間があるときに在庫レポートを確認していただけますか？少し誤りがあるかもしれません。`, reply: 'もちろんです、すぐに確認して報告します。' },
        { initiator: (_name) => `来週エミリーの誕生日があります！みんなでケーキを買おうと思っているんですが、参加しませんか？`, reply: 'いいですね！ぜひ参加します！' },
        { initiator: (_name) => `${_name}さん、Q3プロジェクト提案の最終仕様書はありますか？`, reply: 'はい、今朝受け取りました。すぐにメールを転送します。' },
        { initiator: (_name) => `リマインダー：明日10時から週次チームミーティングがあります。`, reply: 'ありがとうございます！カレンダーに入れています。' },
        { initiator: (_name) => `${_name}さん、今日の午後に少しお時間ありますか？ローンチ計画について話したいのですが。`, reply: '14時以降なら空いています。招待を送ってください。' },
        { initiator: (_name) => `モックアップへの最新のクライアントフィードバックはもう見ましたか？`, reply: 'まだです、ちょうどログインしました。今メールを確認します。良い内容だといいですね！' },
        { initiator: (_name) => `月次レポートのデータ分析で少し詰まっています。${_name}さん、私のスプレッドシートを見てもらえますか？`, reply: 'もちろんです。準備ができたらリンクを送ってください。' },
        { initiator: (_name) => `今日ランチに行きませんか？新しいサンドイッチ屋さんを試してみようかと思って。`, reply: 'いいですね。何時にしましょうか？' },
        { initiator: (_name) => `${_name}さん、プレゼン本当に素晴らしかったです！お疲れ様でした！`, reply: 'ありがとうございます！そう言っていただけて嬉しいです。' },
        { initiator: (_name) => `${_name}さん、週末はどうでしたか？`, reply: '良かったです、ありがとうございます！ゆっくり休みました。あなたは？' },
        { initiator: (_name) => `${_name}さん、金曜日の最初の1時間を代わりに入ってもらえますか？急用ができてしまって。`, reply: '多分大丈夫です。スケジュールを確認して数分以内に連絡します。' },
        { initiator: (_name) => `お知らせ：先月の経費報告書は本日中に提出が必要です。`, reply: 'うっかり忘れるところでした！教えてくれてありがとうございます、すぐ提出します。' },
        { initiator: (_name) => `今朝VPNに繋がらない方はいますか？`, reply: '私もすごく遅いです。ITにチケットを出そうと思っていたところです。' },
        { initiator: (_name) => `${_name}さん、契約成立おめでとうございます！チーム全員で喜んでいます。`, reply: 'ありがとうございます！チーム全員のおかげです。' },
      ],
      es_MX: [
        { initiator: (_name) => `Oye ${_name}, solo recordarte que tu turno empieza en como una hora. ¡Ahí te veo!`, reply: 'Entendido, ¡gracias por el aviso! Ya voy en camino.' },
        { initiator: (_name) => `Hola ${_name}, ¿podrías revisar el reporte de inventario cuando tengas chance? Creo que hay un error.`, reply: 'Claro, ahorita lo reviso y te digo qué encontré.' },
        { initiator: (_name) => `¡El cumple de Emily es la próxima semana! Se me ocurrió que podríamos juntar para un pastel. ¿Te apuntas?`, reply: '¡Qué buena idea! Yo me apunto para el pastel.' },
        { initiator: (_name) => `Pregunta rápida, ${_name} — ¿tienes las especificaciones finales para la propuesta del proyecto Q3?`, reply: 'Sí, me llegaron esta mañana. Te reenvío el correo ahorita.' },
        { initiator: (_name) => `Recordatorio: nuestra reunion semanal de equipo es mañana a las 10.`, reply: '¡Gracias! Ya lo tengo en el calendario.' },
        { initiator: (_name) => `¿Tienes chance de una llamada rápida esta tarde, ${_name}? Quería repasar el plan de lanzamiento.`, reply: 'Sí, estoy libre después de las 2. Mándame la invitación.' },
        { initiator: (_name) => `¿Ya viste el último feedback del cliente sobre los mockups?`, reply: 'Todavía no, acabo de entrar. Voy a checar mi correo ahorita. ¡Esperemos que sean buenas noticias!' },
        { initiator: (_name) => `Ando un poco atorado en el análisis de datos para el reporte mensual. ¿Podrías echarle un ojo a mi hoja de cálculo, ${_name}?`, reply: 'Con mucho gusto. Mándame el link cuando quieras.' },
        { initiator: (_name) => `¿Comes hoy? Pensé en ir a ese café de tortas que abrieron.`, reply: '¡Sí, por qué no! ¿A qué hora pensabas?' },
        { initiator: (_name) => `¡Felicidades por la presentación, ${_name}! La verdad la rifaste.`, reply: '¡Muchas gracias! De verdad me alegra escuchar eso.' },
        { initiator: (_name) => `¿Cómo estuvo tu fin de semana, ${_name}?`, reply: 'Muy bien, gracias. Me descansé bien. ¿Y el tuyo?' },
        { initiator: (_name) => `${_name}, ¿me puedes cubrir la primera hora del viernes? Me surgió algo inesperado.`, reply: 'Creo que sí, déjame checar mi agenda y te confirmo en unos minutos.' },
        { initiator: (_name) => `Aviso: todos los reportes de gastos del mes pasado tienen que entregarse hoy antes de que acabe el día.`, reply: '¡Ay, casi se me va! Gracias por el aviso, ahorita lo mando.' },
        { initiator: (_name) => `¿Alguien más está teniendo problemas con la VPN esta mañana?`, reply: 'Sí, a mí también me va muy lento. Ya iba a abrir un ticket con IT.' },
        { initiator: (_name) => `¡Buen cierre, ${_name}! Todo el equipo está echando porras.`, reply: '¡Muchas gracias! Fue un trabajo de todos.' },
      ],
      nl_NL: [
        { initiator: (_name) => `Hey ${_name}, even een herinnering: je dienst begint over een uur. Tot zo!`, reply: 'Begrepen, dank voor de herinnering! Ik ben onderweg.' },
        { initiator: (_name) => `Hallo ${_name}, kun je het voorraadrapport even controleren als je tijd hebt? Ik denk dat er een fout in zit.`, reply: 'Tuurlijk, ik kijk er nu meteen naar en laat je weten wat ik vind.' },
        { initiator: (_name) => `Emily heeft volgende week haar verjaardag! Ik dacht dat we allemaal konden bijdragen voor een taart. Doe je mee?`, reply: 'Leuk idee! Ik doe zeker mee.' },
        { initiator: (_name) => `Snelle vraag, ${_name} — heb jij de definitieve specificaties voor het Q3-projectvoorstel?`, reply: 'Ja, die heb ik vanmorgen ontvangen. Ik stuur je de e-mail zo door.' },
        { initiator: (_name) => `Herinnering: ons wekelijks teamoverleg is morgen om 10 uur.`, reply: 'Bedankt! Ik heb het al in mijn agenda staan.' },
        { initiator: (_name) => `Heb je vanmiddag even tijd voor een kort gesprekje, ${_name}? Ik wil het lanceerplan doornemen.`, reply: 'Ja, na 14 uur heb ik tijd. Stuur me maar een uitnodiging.' },
        { initiator: (_name) => `Heb je de laatste klantfeedback op de mockups al gezien?`, reply: 'Nog niet, ik ben net ingelogd. Ik kijk nu in mijn mail. Hopelijk goed nieuws!' },
        { initiator: (_name) => `Ik zit een beetje vast bij de data-analyse voor het maandrapport. Kun je even naar mijn spreadsheet kijken, ${_name}?`, reply: 'Natuurlijk, met alle plezier. Stuur me de link maar wanneer je wilt.' },
        { initiator: (_name) => `Heb je zin om vandaag te lunchen? Ik dacht aan dat nieuwe broodjesrestaurant.`, reply: 'Ja, waarom niet! Hoe laat dacht je?' },
        { initiator: (_name) => `Gefeliciteerd met de geslaagde presentatie, ${_name}! Je hebt het echt geweldig gedaan.`, reply: 'Heel erg bedankt! Dat waardeer ik echt.' },
        { initiator: (_name) => `Hoe was je weekend, ${_name}?`, reply: 'Geweldig, bedankt! Lekker uitgerust. En dat van jou?' },
        { initiator: (_name) => `${_name}, kun je het eerste uur van mijn vrijdagdienst overnemen? Er is iets onverwachts tussengekomen.`, reply: 'Ik denk het wel, maar laat me even mijn agenda controleren. Ik laat je over een paar minuten weten.' },
        { initiator: (_name) => `Korte melding: alle onkostendeclaraties van vorige maand moeten vandaag voor het einde van de dag worden ingediend.`, reply: 'Oeps, bijna vergeten! Bedankt voor de herinnering, ik dien het nu meteen in.' },
        { initiator: (_name) => `Heeft iemand anders vanmorgen problemen met de VPN?`, reply: 'Ja, bij mij is het ook erg langzaam. Ik stond op het punt om een ticket in te dienen bij IT.' },
        { initiator: (_name) => `Goed gedaan met die deal, ${_name}! Het hele team viert mee.`, reply: 'Heel erg bedankt! Het was echt een teaminspanning.' },
      ],
    };

    const getLocalizedChatPairs = (locales: string[] = []): ChatPair[] => {
      for (const locale of locales) {
        const exact = LOCALIZED_CHAT_PAIRS[locale];
        if (exact) return exact;
        const prefix = locale.split('_')[0];
        const match = Object.keys(LOCALIZED_CHAT_PAIRS).find(k => k.startsWith(prefix));
        if (match) return LOCALIZED_CHAT_PAIRS[match]!;
      }
      return MASTER_CHAT_MESSAGE_PAIRS;
    };

    const effectiveChatPairs = getLocalizedChatPairs(options.locales || []);
    const availableParentReplyPairs = [...MASTER_PARENT_REPLY_PAIRS];
    const availableSingleComments = [...MASTER_SINGLE_COMMENTS];

    /**
     * The original random response generator, kept as a fallback.
     * @param questions The list of survey questions.
     * @returns A payload with randomly generated answers.
     */
    function generateRandomSurveyResponse(questions: SurveyQuestion[]): { content: Record<string, unknown> } {
        const content: Record<string, unknown> = {};
        if (!questions) return { content };

        for (const question of questions) {
            switch (question?.questionType) {
                case 'STAR': case 'SCALE': case 'NPS':
                    content[question.id] = getRandomInt(1, question.maxScale || (question.questionType === 'STAR' ? 5 : 10));
                    break;
                case 'TEXT':
                    content[question.id] = getRandomItem(MASTER_SURVEY_COMMENT_BANK);
                    break;
                case 'MULTIPLE_CHOICE': {
                    const qOptions = question.content?.en_US?.options;
                    if (qOptions && qOptions.length > 0) {
                        const chosen = getRandomItem(qOptions);
                        if (chosen) content[question.id] = [chosen.id];
                    }
                    break;
                }
                default: break;
            }
        }
        return { content };
    }

    /**
     * Generates a URL-encoded form submission payload from a form schema.
     * @param schema - The parsed getSchemaPrivacyExposed response.
     * @returns URLSearchParams ready to be submitted as application/x-www-form-urlencoded
     */
    function generateRandomFormResponse(schema: FormSchema): URLSearchParams {
        const fields = schema?.formTranslations?.en_US?.options?.fields || {};
        const schemaProps = schema?.formTranslations?.en_US?.schema?.properties || {};
        const params = new URLSearchParams();
        const skipTypes = ['separator', 'imageSeparator', 'profileField'];

        for (const [key, field] of Object.entries(fields)) {
            if (skipTypes.includes(field.type)) continue;
            const prop = schemaProps[key];
            if (Array.isArray(prop) && prop.length === 0) continue; // empty array = non-data field

            switch (field.type) {
                case 'text':
                case 'textarea':
                    params.set(key, getRandomItem(MASTER_SURVEY_COMMENT_BANK) || 'Great overall experience.');
                    break;
                case 'date': {
                    const year = new Date().getFullYear() - getRandomInt(10, 40);
                    const month = String(getRandomInt(1, 12)).padStart(2, '0');
                    const day = String(getRandomInt(1, 28)).padStart(2, '0');
                    params.set(key, `${year}-${month}-${day}`);
                    break;
                }
                case 'select':
                case 'radio': {
                    const vals = prop?.enum || [];
                    if (vals.length > 0) params.set(key, String(getRandomItem(vals) ?? ''));
                    break;
                }
                case 'checkbox': {
                    const vals = prop?.enum || [];
                    if (vals.length > 0) {
                        const count = getRandomInt(1, Math.min(vals.length, 2));
                        const shuffled = [...vals].sort(() => Math.random() - 0.5).slice(0, count);
                        shuffled.forEach(v => params.append(`${key}[]`, String(v)));
                    }
                    break;
                }
                case 'labeledSelect': {
                    const optCount = (prop?.enum || field?.optionLabels || []).length;
                    if (optCount > 0) params.set(key, String(getRandomInt(0, optCount - 1)));
                    break;
                }
                default: break;
            }
        }
        return params;
    }

    // --- Survey Handling Functions ---
    async function getSurveysWithQuestions(csrfToken: string, selectedSurveyIds: string[]): Promise<SurveyData[]> {
        const response = await fetch('/api/installations/administrated?pluginID=surveys&limit=-1', { headers: { 'x-csrf-token': csrfToken } });
        if (!response.ok) return [];
        const { data } = await response.json() as { data: SurveyData[] };

        // Filter surveys based on the IDs selected in the form
        const selectedSurveys = data.filter(survey => selectedSurveyIds.includes(survey.id));
        logger.info(`Found ${selectedSurveys.length} selected surveys to process.`);

        const surveysWithQuestions: SurveyData[] = [];
        for (const survey of selectedSurveys) {
            const statusResponse = await fetch(`/api/surveys/installations/${survey.id}`, { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
            if (!statusResponse.ok) continue;
            const statusData = await statusResponse.json() as { status?: string; latestSurveyClosedAt?: string };
            if (statusData.status !== 'PUBLISHED' || (statusData.latestSurveyClosedAt && new Date(statusData.latestSurveyClosedAt) < new Date())) continue;
            const questionsResponse = await fetch(`/api/surveys/installations/${survey.id}/questions`, { headers: { 'x-csrf-token': csrfToken } });
            if (questionsResponse.ok) {
                const questionsData = await questionsResponse.json() as { questions?: SurveyQuestion[] } | SurveyQuestion[];
                const questions = (questionsData as { questions?: SurveyQuestion[] }).questions || (questionsData as SurveyQuestion[]);
                // The questions endpoint can return an object with a `questions` property or just the array
                surveysWithQuestions.push({ ...survey, questions });
            }
        }
        return surveysWithQuestions;
    }

    async function submitSurveyFeedback(jwt: string, payload: unknown): Promise<Response> {
        return fetch('https://pluginsurveys-us1.staffbase.com/api/v1/feedback', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    async function handleSurveys(
        survey: SurveyData | undefined,
        csrfToken: string,
        updateProgress: UpdateProgressFn,
        preGeneratedAnswers: Record<string, unknown>[] | undefined
    ): Promise<void> {
        if (!survey) return;

        try {
            const surveyTitle = survey.config?.localization?.en_US?.title || survey.id;
            updateProgress({ status: `Answering survey: ${surveyTitle}` });

            const frontendForwardUrl = survey.links?.frontend_forward?.href;
            if (!frontendForwardUrl) {
                throw new Error(`Survey "${surveyTitle}" is missing frontend_forward link. Survey object: ${JSON.stringify(survey.links)}`);
            }

            const currentDomain = window.location.hostname;
            logger.info(`[Survey Debug] Domain: ${currentDomain} | Survey ID: ${survey.id} | frontend_forward URL: ${frontendForwardUrl}`);

            if (!currentDomain.endsWith('staffbase.com') && !currentDomain.endsWith('staffbase.rocks') && !currentDomain.endsWith('staffbase.dev')) {
                logger.warn(`[Survey Debug] Domain "${currentDomain}" may not be covered by the background webRequest listener. JWT capture may fail.`);
            }

            logger.info(`Triggering JWT generation for survey "${surveyTitle}". A 404 network error for this action is expected and can be ignored.`);
            fetch(frontendForwardUrl, { headers: { 'x-csrf-token': csrfToken } })
                .then((res) => logger.info(`[Survey Debug] frontend_forward fetch responded with status ${res.status} (redirect should have been intercepted by background)`))
                .catch((err: unknown) => logger.warn(`[Survey Debug] frontend_forward fetch error (may be normal if CORS): ${err instanceof Error ? err.message : String(err)}`));

            const jwt = await pollForJwtInStorage(survey.id);

            // Fetch the active survey questions using the new endpoint
            const activeSurveyResponse = await fetch('https://pluginsurveys-us1.staffbase.com/api/v1/survey/active', {
                headers: { 'Authorization': `Bearer ${jwt}` }
            });

            if (!activeSurveyResponse.ok) {
                throw new Error(`Failed to fetch active survey questions. Status: ${activeSurveyResponse.status}`);
            }

            const activeSurveyData = await activeSurveyResponse.json() as { questions?: SurveyQuestion[] };
            const questions = activeSurveyData.questions;

            if (questions && questions.length > 0) {
                let responsePayload: { content: Record<string, unknown> } = { content: {} };
                // Use a pre-generated answer if available, otherwise generate a random one as a fallback.
                if (preGeneratedAnswers && preGeneratedAnswers.length > 0) {
                    const answerSet = preGeneratedAnswers.shift()!; // Next available answer set
                    // Validate and remap against live question IDs/constraints from the JWT-fetched active survey.
                    // Pre-generated IDs come from App.js pre-fetch; live IDs come from pluginsurveys API.
                    const validatedContent: Record<string, unknown> = {};
                    let fallbackCount = 0;
                    for (const question of questions) {
                        const qId = question.id;
                        const preVal = answerSet[qId];
                        let accepted = false;
                        if (preVal !== undefined && preVal !== null) {
                            switch (question.questionType) {
                                case 'STAR': case 'SCALE': case 'NPS': {
                                    const n = parseInt(String(preVal), 10);
                                    const max = question.maxScale || (question.questionType === 'STAR' ? 5 : 10);
                                    if (!isNaN(n) && n >= 1 && n <= max) { validatedContent[qId] = n; accepted = true; }
                                    break;
                                }
                                case 'TEXT':
                                    if (typeof preVal === 'string' && preVal.trim().length > 0) { validatedContent[qId] = preVal; accepted = true; }
                                    break;
                                case 'MULTIPLE_CHOICE':
                                    if (Array.isArray(preVal) && preVal.length > 0) { validatedContent[qId] = preVal; accepted = true; }
                                    break;
                                default:
                                    validatedContent[qId] = preVal; accepted = true; break;
                            }
                        }
                        if (!accepted) {
                            const fallback = generateRandomSurveyResponse([question]);
                            Object.assign(validatedContent, fallback.content);
                            fallbackCount++;
                        }
                    }
                    responsePayload = { content: validatedContent };
                    logger.info(`Using pre-generated AI survey response (${fallbackCount > 0 ? `${fallbackCount} question(s) used random fallback` : 'all questions matched'}).`);
                } else {
                    responsePayload = generateRandomSurveyResponse(questions);
                    logger.warn(`Using fallback random generator for survey "${surveyTitle}".`);
                }

                const submitResponse = await submitSurveyFeedback(jwt, responsePayload);
                if (!submitResponse.ok) {
                    const errBody = await submitResponse.text().catch(() => '');
                    logger.warn(`Survey payload sent: ${JSON.stringify(responsePayload)}`);
                    throw new Error(`Survey submission API failed with status ${submitResponse.status}: ${errBody}`);
                }
                logger.success(`Submitted AI-generated survey: '${surveyTitle}'`);
                updateProgress({ increment: true });
            } else {
                logger.warn(`No questions found for active survey "${surveyTitle}". Skipping.`);
            }
            await sleep(1500);
        } catch (error) {
            logger.error(`Survey did not submit: '${survey.config?.localization?.en_US?.title || survey.id}'`, error);
        }
    }

    // --- Form Handling Functions ---

    /**
     * Converts a pre-generated AI answer object to URLSearchParams.
     * Arrays become `_key[]=val1&_key[]=val2` (checkbox fields).
     * Does NOT require a schema — the AI only emits keys it was given.
     */
    function convertFormAnswersToParams(answerSet: Record<string, unknown>): URLSearchParams {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(answerSet)) {
            if (value === null || value === undefined) continue;
            if (Array.isArray(value)) {
                value.forEach((v: unknown) => params.append(`${key}[]`, String(v)));
            } else {
                params.set(key, String(value));
            }
        }
        return params;
    }

    async function handleForm(
        formId: string,
        formName: string,
        version: number,
        updateProgress: UpdateProgressFn,
        preGeneratedAnswers: Record<string, unknown>[] | undefined,
        csrfToken: string
    ): Promise<void> {
        try {
            updateProgress({ status: `Submitting form: ${formName}` });

            let formData: URLSearchParams;

            // Pre-visit the form page — sets up server-side session state and extracts the form-specific CSRF token.
            let formCsrfToken = csrfToken; // fallback to API token
            const preVisit = await fetch(`/plugins/forms/${formId}`, { method: 'GET', credentials: 'include' });
            if (preVisit.ok) {
                const pageText = await preVisit.text().catch(() => '');
                // Extract the forms-plugin CSRF token (long hex format) from the page
                const csrfMatch = pageText.match(/["']csrfToken["']\s*:\s*["']([a-f0-9]{60,}[^"']*)[^"']*["']/i)
                    || pageText.match(/name=["']_csrf["'][^>]*value=["']([^"']+)["']/i)
                    || pageText.match(/meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i);
                if (csrfMatch) {
                    formCsrfToken = csrfMatch[1];
                    logger.info(`Extracted form CSRF token from page.`);
                }
                // Try to grab version_no from the live page
                const versionMatch = pageText.match(/["']version_no["']\s*:\s*(\d+)/);
                if (versionMatch) version = parseInt(versionMatch[1], 10);
            }

            if (preGeneratedAnswers && preGeneratedAnswers.length > 0) {
                const answerSet = preGeneratedAnswers.shift()!;
                formData = convertFormAnswersToParams(answerSet);
                logger.info(`Using pre-generated AI answers for form "${formName}" (version ${version}).`);
            } else {
                const schemaRes = await fetch(`/plugins/forms/${formId}?eyoAction=getSchemaPrivacyExposed`, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest', 'x-csrf-token': formCsrfToken },
                });
                if (!schemaRes.ok) throw new Error(`Failed to fetch form schema (${schemaRes.status})`);
                const schema = await schemaRes.json() as FormSchema;
                version = schema.version_no || version;
                formData = generateRandomFormResponse(schema);
                logger.warn(`Using random fallback for form "${formName}" (version ${version}).`);
            }

            const submitRes = await fetch(`/plugins/forms/${formId}?eyoAction=submitAnswer&version=${version}`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'x-csrf-token': formCsrfToken,
                },
                body: formData.toString(),
            });

            if (!submitRes.ok) {
                const errBody = await submitRes.text().catch(() => '');
                logger.warn(`Form submission failed (${submitRes.status}). Body: ${errBody || '(empty)'}`);
                logger.warn(`Form payload: ${formData.toString()}`);
                throw new Error(`Form submission failed (${submitRes.status})`);
            }

            const result = await submitRes.json() as { status?: string; msg?: string };
            if (result.status === 'success') {
                logger.success(`Submitted form "${formName}"`);
                updateProgress({ increment: true });
            } else {
                throw new Error(`Form returned: ${result.msg}`);
            }

            await sleep(1000);
        } catch (error) {
            logger.error(`Form "${formName}" did not submit:`, error);
        }
    }

    // --- Chat Handling Functions ---
    async function getChatInstallationId(csrfToken: string): Promise<string | null> {
        logger.info("Fetching chat installation ID...");
        try {
            const response = await fetch('/api/installations/administrated?pluginID=chat', { headers: { 'x-csrf-token': csrfToken } });
            if (!response.ok) {
                const fallbackResponse = await fetch('/api/plugins/chat/installations', { headers: { 'x-csrf-token': csrfToken } });
                if (!fallbackResponse.ok) throw new Error('Failed to fetch chat installation via primary or fallback method.');
                const fallbackData = await fallbackResponse.json() as { data?: { id: string }[] };
                if (fallbackData?.data && fallbackData.data.length > 0) {
                    logger.success("Found chat installation ID via fallback.");
                    return fallbackData.data[0].id;
                }
            }
            const { data } = await response.json() as { data?: { id: string }[] };
            if (data && data.length > 0) {
                logger.success("Found chat installation ID.");
                return data[0].id;
            }
            throw new Error('Chat installation not found in API response.');
        } catch (error) {
            logger.warn(`Could not retrieve chat installation ID. Skipping chat actions.`, error);
            return null;
        }
    }

    async function handleChats(
        currentUser: AutomationUser,
        chatInstallationId: string | null,
        csrfToken: string,
        pendingChats: PendingChat[],
        updateProgress: UpdateProgressFn
    ): Promise<void> {
        if (!chatInstallationId || currentUser.id === adminId) {
            if (currentUser.id === adminId) logger.info(`Skipping chat reply for admin user.`);
            return;
        }
        updateProgress({ status: "Replying to chat..." });
        const pendingChatIndex = pendingChats.findIndex((c: PendingChat) => c.recipientId === currentUser.id);
        if (pendingChatIndex > -1) {
            const [chatToReplyTo] = pendingChats.splice(pendingChatIndex, 1);
            try {
                const endpoint = `/api/installations/${chatInstallationId}/conversations/direct/${chatToReplyTo.initiatorId}`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-csrf-token': csrfToken,
                    },
                    body: JSON.stringify({ message: chatToReplyTo.replyText })
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    logger.error(`Chat reply API failed with status ${response.status}`, errorBody);
                    throw new Error(`API returned status ${response.status}`);
                }

                logger.success("Successfully sent chat reply.");
                updateProgress({ increment: true });
            } catch (error) {
                logger.error(`Failed to reply to chat.`, error);
            }
        } else {
            logger.info(`No pending chat messages found for this user.`);
        }
    }

    // --- Main Execution ---
    async function run() {
        logger.section("🚀 Automation Script Started 🚀");

        let initialCsrfToken: string;
        let surveysWithQuestions: SurveyData[] = [];
        let publishedPosts: { id: string }[] = [];
        let chatInstallationId: string | null = null;
        let pendingReplies: PendingReply[] = [];
        let pendingChats: PendingChat[] = [];
        const surveyAnswers: Record<string, Record<string, unknown>[]> = {};
        const formAnswers: Record<string, Record<string, unknown>[]> = {};
        const postComments: PostCommentsMap = preGeneratedComments || {};
        let tasksCompleted = 0, totalTasks = 0;

        const updateProgress: UpdateProgressFn = ({ increment = false, status = null, user = null }: ProgressUpdate) => {
            if (increment) tasksCompleted++;
            chromeSend({
                type: 'automationProgress',
                payload: { tasksCompleted, totalTasks, status, user }
            });
        };

        try {
            logger.section("Pre-flight Checks & Task Calculation");
            initialCsrfToken = await getFreshCsrfToken();

            if (options.surveys && options.useAI) {
                surveysWithQuestions = await getSurveysWithQuestions(initialCsrfToken, options.selectedSurveyIds || []);
                totalTasks += surveysWithQuestions.length * users.length;
                updateProgress({ status: "Loading pre-generated survey responses..." });

                if (surveysWithQuestions.length > 0) {
                    logger.section("Loading Pre-Generated AI Survey Responses");
                    for (const survey of surveysWithQuestions) {
                        const surveyTitle = survey.config?.localization?.en_US?.title || survey.id;
                        if (options.preGeneratedSurveyAnswers?.[survey.id]) {
                            surveyAnswers[survey.id] = options.preGeneratedSurveyAnswers[survey.id];
                            logger.success(`Loaded pre-generated AI responses for "${surveyTitle}".`);
                        } else {
                            logger.warn(`No pre-generated responses for "${surveyTitle}". Will use random fallback.`);
                        }
                    }
                }
            } else if (options.surveys) { // Surveys enabled, but AI is not
                surveysWithQuestions = await getSurveysWithQuestions(initialCsrfToken, options.selectedSurveyIds || []);
                totalTasks += surveysWithQuestions.length * users.length;
                updateProgress({ status: "Calculating survey tasks (non-AI)..." });
            }

            if (options.comments) {
                const postsResponse = await fetch('/api/posts?limit=20&sort=published_DESC&publicationState=published', { headers: { 'x-csrf-token': initialCsrfToken } });
                publishedPosts = ((await postsResponse.json()) as { data?: { id: string }[] }).data || [];
                if (!publishedPosts?.length) { alert("No published posts found. Aborting."); return; }

                totalTasks += users.length * (options.selectedPostIds?.length || 0) * 2; // Max 2 comments per user per post

                if (options.useAI) {
                    if (hasPreGeneratedComments) {
                        logger.section("Using Pre-Generated AI Post Comments");
                        logger.info("Using AI comments generated in the extension.");
                    } else {
                        logger.warn("No pre-generated comments found. Will use random fallback for all posts.");
                    }
                }
            }
            if (options.chats) {
                chatInstallationId = await getChatInstallationId(initialCsrfToken);
                if (chatInstallationId && adminId) {
                    totalTasks += users.filter(u => u.id !== adminId).length * 2;
                }
            }

            if (!users?.length) { alert("No users provided for automation. Aborting."); return; }
            if (options.forms) {
                totalTasks += users.length * (options.selectedForms?.length || 0);
                if (options.useAI && options.preGeneratedFormAnswers) {
                    for (const form of (options.selectedForms || [])) {
                        if (options.preGeneratedFormAnswers[form.id]) {
                            formAnswers[form.id] = [...options.preGeneratedFormAnswers[form.id]];
                            logger.success(`Loaded pre-generated AI responses for form "${form.name}".`);
                        } else {
                            logger.warn(`No pre-generated responses for form "${form.name}". Will use random fallback.`);
                        }
                    }
                }
            }
            if (options.reactions) totalTasks += users.length * 10;

            updateProgress({ status: "Initializing..." });

            if (options.chats && chatInstallationId && adminId) {
                updateProgress({ status: "Admin is sending initial chats..." });
                logger.info("Admin user is pre-sending initial chat messages...");
                let dynamicAdminIdSet = false; // Flag to ensure we only set the ID once
                let chatPairs: ChatPair[] = [];

                if (options.useAI && options.prospectName) {
                    if (options.preGeneratedChatPairs?.length) {
                        chatPairs = [...options.preGeneratedChatPairs];
                        logger.success(`Using ${chatPairs.length} pre-generated AI chat pairs.`);
                    } else {
                        logger.warn("No pre-generated chat pairs found. Falling back to static chat bank.");
                    }
                } else {
                    logger.info("Using static chat bank.");
                }

                for (const user of users) {
                    if (user.id === adminId && !dynamicAdminIdSet) {
                         // Skip sending a message to the original admin ID before it's been corrected
                         continue;
                    }
                     if (user.id === adminId) {
                        // After correction, skip sending message to the now-correct admin ID
                        continue;
                    }

                    let chatPair = getUniqueRandomItem(chatPairs, effectiveChatPairs);

                    // If we fell back to the master list, we need to handle the function-based initiator
                    if (typeof chatPair.initiator === 'function') {
                        chatPair = { ...chatPair, initiator: chatPair.initiator(user.firstName || 'there') };
                    }

                    try {
                        let messageText: string;
                        // The static bank uses a function, but the AI generates a string with a placeholder.
                        if (typeof chatPair.initiator === 'function') {
                            messageText = chatPair.initiator(user.firstName || 'there');
                        } else {
                            messageText = chatPair.initiator.replace('{name}', user.firstName || 'there');
                        }

                        const endpoint = `/api/installations/${chatInstallationId}/conversations/direct/${user.id}`;
                        const response = await fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-csrf-token': initialCsrfToken },
                            body: JSON.stringify({ message: messageText })
                        });

                        if (response.ok) {
                            const responseData = await response.json() as { senderID?: string };

                            // --- Dynamically set the adminId from the first successful response ---
                            if (!dynamicAdminIdSet && responseData.senderID) {
                                logger.info(`Original adminId was: ${adminId}`);
                                adminId = responseData.senderID; // Overwrite with the correct ID
                                dynamicAdminIdSet = true;
                                logger.success(`Dynamically confirmed correct admin ID: ${adminId}`);
                            }

                            pendingChats.push({ recipientId: user.id, initiatorId: adminId, replyText: chatPair.reply });
                            updateProgress({ increment: true });
                        } else {
                           const errorBody = await response.text();
                           logger.warn(`Could not send initial chat to ${user.firstName || user.id}. Status: ${response.status}`, errorBody);
                        }
                        await sleep(500);
                    } catch (error) { logger.error(`Error pre-sending chat to ${user.id}`, error); }
                }
            }
            logger.success(`Pre-flight complete. Total tasks to run: ${totalTasks}`);
        } catch (error) {
            logger.error('Fatal error during pre-flight checks. Aborting script.', error);
            alert(`Failed to pre-fetch data: ${error instanceof Error ? error.message : String(error)}. Aborting.`);
            return;
        }

        logger.section("Starting Automation Loop");
        for (const user of users) {
            let freshCsrfToken: string | null = null;
            const userFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.id;
            logger.user(userFullName);

            try {
                updateProgress({ user: userFullName, status: "Logging in..." });
                const identifier = user.emails?.find(e => e.primary)?.value || user.emails?.[0]?.value;
                if (!identifier) throw new Error(`User ID ${user.id} has no email address.`);

                const loginResponse = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, secret: sharedDemoPassword, locale: 'en_US' }) });
                if (!loginResponse.ok) throw new Error(`API returned status ${loginResponse.status}`);

                logger.success(`Logged in as ${userFullName}.`);
                freshCsrfToken = await getFreshCsrfToken();
                await sleep(1000);

                if (options.surveys && surveysWithQuestions.length > 0) {
                    for (const survey of surveysWithQuestions) {
                        const preGeneratedAnswers = surveyAnswers[survey.id];
                        await handleSurveys(survey, freshCsrfToken, updateProgress, preGeneratedAnswers);
                    }
                }

                if (options.forms && options.selectedForms?.length) {
                    for (const form of options.selectedForms) {
                        await handleForm(form.id, form.name, form.version ?? 1, updateProgress, formAnswers[form.id], freshCsrfToken);
                    }
                }

                if (options.reactions) {
                    updateProgress({ status: "Adding reactions..." });
                    for (let i = 0; i < 10; i++) {
                        await fetch('/api/reactions', {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': freshCsrfToken! },
                            body: JSON.stringify({ parentId: getRandomItem(publishedPosts)?.id, parentType: 'post', type: getRandomItem(MASTER_REACTION_TYPES) })
                        });
                        updateProgress({ increment: true });
                        await sleep(500);
                    }
                }

                if (options.comments) {
                    updateProgress({ status: "Posting comments..." });
                    const postComment = async (text: string, postId: string | null, parentId: string | null = null): Promise<{ id: string }> => {
                        const url = parentId ? `/api/comments/${parentId}/comments` : `/api/articles/${postId}/comments`;
                        const response = await fetch(url, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': freshCsrfToken! },
                            body: JSON.stringify({ text: `<p>${text}</p>` })
                        });
                        if (!response.ok) {
                            const errorBody = await response.text();
                            throw new Error(`Comment API failed with status ${response.status}: ${errorBody}`);
                        }
                        updateProgress({ increment: true });
                        return response.json() as Promise<{ id: string }>;
                    };

                    const handlePairedComment = async (postId: string) => {
                        const replyableIndex = pendingReplies.findIndex(p => p.authorId !== user.id);
                        if (replyableIndex > -1) {
                            const [replyable] = pendingReplies.splice(replyableIndex, 1);
                            await postComment(replyable.replyText, null, replyable.parentId);
                        } else {
                            const commentBank = postComments[postId];

                            let pair: { parent: string; reply: string };
                            if (options.useAI && commentBank?.comment_reply_pairs?.length) {
                                pair = commentBank.comment_reply_pairs.shift()!;
                                logger.info("Using AI-generated comment/reply pair.");
                            } else {
                                pair = getUniqueRandomItem(availableParentReplyPairs, MASTER_PARENT_REPLY_PAIRS);
                                if (options.useAI && postComments[postId]) logger.warn("Using fallback random comment/reply pair.");
                            }
                            const newParent = await postComment(pair.parent, postId);
                            pendingReplies.push({ parentId: newParent.id, replyText: pair.reply, authorId: user.id });
                        }
                    };

                    const postStandaloneComment = async (postId: string) => {
                        let commentText: string;
                        const commentBank = postComments[postId];

                        if (options.useAI && commentBank?.standalone_comments?.length) {
                            commentText = commentBank.standalone_comments.shift()!;
                            logger.info("Using AI-generated standalone comment.");
                        } else {
                            commentText = getUniqueRandomItem(availableSingleComments, MASTER_SINGLE_COMMENTS);
                            if (options.useAI && postComments[postId]) logger.warn("Using fallback random standalone comment.");
                        }
                        await postComment(commentText, postId);
                    };

                    // --- Loop through every selected post for the current user ---
                    for (const postId of (options.selectedPostIds || [])) {
                        const postAction = Math.random();
                        try {
                            if (postAction < 0.5) { // 50% chance: Post one standalone comment
                                logger.info(`Action: Posting one standalone comment on post ${postId}.`);
                                await postStandaloneComment(postId);
                                updateProgress({ increment: true }); // Mark the second potential task as complete
                            } else if (postAction < 0.85) { // 35% chance: Post one parent comment
                                logger.info(`Action: Posting one parent comment on post ${postId}.`);
                                await handlePairedComment(postId);
                                updateProgress({ increment: true }); // Mark the second potential task as complete
                            } else { // 15% chance: Post a standalone comment AND a reply
                                logger.info(`Action: Posting a standalone comment and then a reply on post ${postId}.`);
                                await postStandaloneComment(postId);
                                await sleep(1500);
                                await handlePairedComment(postId); // This will be a reply if one is available
                            }
                        } catch (error) {
                            logger.error(`An error occurred during the commenting action on post ${postId}.`, error);
                            // Increment tasks to avoid progress bar stall
                            updateProgress({ increment: true });
                            updateProgress({ increment: true });
                        }
                        await sleep(1500); // Pause between posts for the same user
                    }
                }

                if (options.chats) {
                    await handleChats(user, chatInstallationId, freshCsrfToken!, pendingChats, updateProgress);
                    await sleep(1500);
                }
            } catch (error) {
                logger.error(`An error occurred for user ${userFullName}. Skipping remaining tasks for this user.`, error);
            }
            await sleep(2000);
        }

        logger.section("✅ Automation Script Finished! ✅");
        chromeSend({ type: 'automationComplete' });
        alert("Automation run has completed successfully! You can close this tab. NOTE: You are logged in as the last user you selected.");
    }

    run();
}
