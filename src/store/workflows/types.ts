import keyMirror from "keymirror";
import { LocalFile } from "../../components/feed/CreateFeed/types";
import { Plugin, PluginInstance, Feed } from "@fnndsc/chrisapi";

export interface AnalysisStep {
  id: number;
  title: string;
  status: "wait" | "process" | "finish" | "error";
  error: any;
}

export interface AnalysisPayload {
  localFiles: LocalFile[];
  workflowType: string;
  username: string;
  infantAge?: string;
}

export interface SelectWorkflowState {
  isOpen: boolean;
  toggleTemplateText: string;
  selectedOption: string;
}

export interface IWorkflowState {
  localfilePayload: {
    files: LocalFile[];
    error: any;
    loading: boolean;
  };
  steps: AnalysisStep[];
  currentStep: number;
  optionState: SelectWorkflowState;
  checkFeedDetails: number | undefined;
  infantAge: string;
}

export interface DircopyData {
  dir: string;
}

export interface Med2ImgData {
  inputFile: any;
  sliceToConvert: number | string;
  outputFileStem?: string;
  previous_id: number;
}

export interface CovidnetData {
  imagefile: any;
  previous_id: number;
}

export interface AFSHackData {
  title?: string;
  previous_id: number;
  inputFile?: string;
  outputFile: string;
  exec: string;
  args: string;
}

export interface IFSHackData {
  title?: string;
  previous_id: number;
  age: number;
}

export enum PollStatus {
  CREATED = "created",
  WAITING = "waiting",
  SCHEDULED = "scheduled",
  STARTED = "started",
  REGISTERING_FILES = "registeringFiles",
  SUCCESS = "finishedSuccessfully",
  ERROR = "finishedWithError",
  CANCELLED = "cancelled",
}

export type Result = {
  plugin: PluginInstance;
  status: string;
};

export type PluginList = {
  [key: string]: Plugin;
};

export type RegistrationCheck = {
  checkPassed: boolean;
  plugins: PluginList;
  error: string;
};

export type FeedReturnPayload = {
  feed?: Feed;
  error?: "";
  instance?: PluginInstance;
};

export type PluginReturnPayload = {
  plugin?: Plugin;
  error: string;
};

export const WorkflowTypes = keyMirror({
  GET_PACS_FILES_REQUEST: null,
  GET_PACS_FILES_SUCCESS: null,
  GET_PACS_FILES_ERROR: null,
  SET_CURRENT_FILE: null,
  SET_PLUGIN_FILES: null,
  SET_LOCAL_FILE: null,
  SUBMIT_ANALYSIS: null,
  STOP_ANALYSIS: null,
  SET_ANALYSIS_STEP: null,
  SET_OPTION_STATE: null,
  SET_INFANT_AGE: null,
  RESET_WORKFLOW_STEP: null,
  STOP_FETCHING_PLUGIN_RESOURCES: null,
  SET_FEED_DETAILS: null,
  SET_CURRENT_STEP: null,
  DELETE_LOCAL_FILE: null,
  CLEAR_FILE_SELECTION: null,
});
