import fs from 'fs';
import path from 'path';
import ConfigService from './ConfigService.js'; // For CHAT_SUMMARY_TIMES

const DB_FILE_PATH = path.resolve(process.cwd(), 'task_statuses.json');
let dbData = {
    lastSchedulerDate: null, // Renamed from lastCheckedDate to be specific to scheduler's daily reset
    dailyTasks: {
        // "YYYY-MM-DD": {
        //   "serverOpen": false,
        //   "serverClose": false,
        //   "serverOpeningSoon": false,
        //   "serverOpeningIn5Min": false,
        //   "sundayNightMessage": false,
        //   "fridayMessage": false,
        //   "chatSummary_HH:MM": false
        // }
    }
};

function loadDb() {
    try {
        if (fs.existsSync(DB_FILE_PATH)) {
            const rawData = fs.readFileSync(DB_FILE_PATH, 'utf-8');
            const parsedData = JSON.parse(rawData);
            // Ensure essential keys exist
            dbData.lastSchedulerDate = parsedData.lastSchedulerDate || null;
            dbData.dailyTasks = parsedData.dailyTasks || {};
        } else {
            // If file doesn't exist, save the initial structure
            saveDb();
        }
    } catch (error) {
        console.error("TaskStatusDbService: Error loading DB file. Initializing with default.", error);
        dbData = { lastSchedulerDate: null, dailyTasks: {} };
        saveDb();
    }
}

function saveDb() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(dbData, null, 2), 'utf-8');
    } catch (error) {
        console.error("TaskStatusDbService: Error saving DB file.", error);
    }
}

// Initialize by loading data from file
loadDb();

function getTasksForDate(dateISO) {
    if (!dbData.dailyTasks[dateISO]) {
        console.log(`TaskStatusDbService: No status found for ${dateISO}. Initializing.`);
        initializeTasksForDate(dateISO, false); // Don't save immediately, let caller decide or batch
    }
    return dbData.dailyTasks[dateISO];
}

function initializeTasksForDate(dateISO, shouldSave = true) {
    const config = ConfigService.getConfig(); // Get fresh config
    const initialStatuses = {
        serverOpen: false,
        serverClose: false,
        serverOpeningSoon: false,
        serverOpeningIn5Min: false,
        sundayNightMessage: false,
        fridayMessage: false
    };

    if (Array.isArray(config.CHAT_SUMMARY_TIMES)) {
        config.CHAT_SUMMARY_TIMES.forEach(timeStr => {
            if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
                initialStatuses[`chatSummary_${timeStr.replace(":", "")}`] = false;
            }
        });
    }
    dbData.dailyTasks[dateISO] = initialStatuses;

    // Clean up old dates (e.g., older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().slice(0, 10);

    Object.keys(dbData.dailyTasks).forEach(storedDate => {
        if (storedDate < sevenDaysAgoISO) {
            delete dbData.dailyTasks[storedDate];
            console.log(`TaskStatusDbService: Cleaned up old task statuses for date: ${storedDate}`);
        }
    });

    if (shouldSave) {
        saveDb();
    }
    return dbData.dailyTasks[dateISO];
}


function isTaskExecuted(taskName, dateISO) {
    const dailyStatuses = getTasksForDate(dateISO);
    return dailyStatuses[taskName] === true;
}

function setTaskExecuted(taskName, dateISO, executed = true) {
    const dailyStatuses = getTasksForDate(dateISO); // Ensures initialization if date is new
    if (dailyStatuses[taskName] !== executed) { // Only save if status changes
        dailyStatuses[taskName] = executed;
        saveDb();
        console.log(`TaskStatusDbService: Task '${taskName}' for ${dateISO} marked as ${executed ? 'EXECUTED' : 'PENDING'}.`);
    }
}

function getLastSchedulerDate() {
    return dbData.lastSchedulerDate;
}

function setLastSchedulerDate(dateISO) {
    if (dbData.lastSchedulerDate !== dateISO) {
        dbData.lastSchedulerDate = dateISO;
        saveDb();
    }
}

// Call this if CHAT_SUMMARY_TIMES in config might have changed
function syncChatSummaryTasksForDate(dateISO) {
    const config = ConfigService.getConfig();
    const currentDayTasks = getTasksForDate(dateISO); // Ensures date entry exists

    const newChatSummaryKeys = new Set();
    if (Array.isArray(config.CHAT_SUMMARY_TIMES)) {
        config.CHAT_SUMMARY_TIMES.forEach(timeStr => {
            if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
                newChatSummaryKeys.add(`chatSummary_${timeStr.replace(":", "")}`);
            }
        });
    }

    let changed = false;
    // Remove old chat summary tasks not in current config
    for (const taskKey in currentDayTasks) {
        if (taskKey.startsWith('chatSummary_') && !newChatSummaryKeys.has(taskKey)) {
            delete currentDayTasks[taskKey];
            changed = true;
            console.log(`TaskStatusDbService: Removed obsolete chat summary task '${taskKey}' for ${dateISO}.`);
        }
    }

    // Add new chat summary tasks from config if they don't exist
    newChatSummaryKeys.forEach(taskKey => {
        if (!(taskKey in currentDayTasks)) {
            currentDayTasks[taskKey] = false; // Initialize as not executed
            changed = true;
            console.log(`TaskStatusDbService: Added new chat summary task '${taskKey}' for ${dateISO}.`);
        }
    });

    if (changed) {
        saveDb();
    }
}


export default {
    initializeTasksForDate,
    isTaskExecuted,
    setTaskExecuted,
    getLastSchedulerDate,
    setLastSchedulerDate,
    getTasksForDate,
    syncChatSummaryTasksForDate,
    // Helper to ensure DB is loaded on module import, good for services
    _loadDb: loadDb
}; 