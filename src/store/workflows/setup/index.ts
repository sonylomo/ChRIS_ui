import {
  RegistrationCheck,
  PluginList,
  DircopyData,
  FeedReturnPayload,
  PollStatus,
  PluginReturnPayload,
} from "../types";
import { v4 } from "uuid";
import ChrisAPIClient from "../../../api/chrisapiclient";
import { stopAnalysis } from "../actions";
import { setYieldAnalysis } from "../saga";
import { IActionTypeParam } from "../../../api/models/base.model";
import { PluginInstance, Feed, Note } from "@fnndsc/chrisapi";
import { LocalFile } from "../../../components/feed/CreateFeed/types";
import { getPlugin, uploadLocalFiles, uploadFilePaths } from "../utils";
import { runCovidnetWorkflow } from "./create workflows/covidnet";
import { runFastsurferWorkflow } from "./create workflows/fastsurfer";
import { runFreesurferWorkflow } from "./create workflows/freesurfer";
import { runFetalReconstructionWorkflow } from "./create workflows/fetalReconstruction";
import { runFreesurferMocWorkflow } from "./create workflows/freesurfer_moc";
import { runFastsurferMocWorkflow } from "./create workflows/fastsurfer_moc";
import { setFeedDetails } from "../actions";
import { put } from "@redux-saga/core/effects";

export function* checkPluginRegistration(pluginList: string[]) {
  const pluginRegistry: RegistrationCheck = {
    checkPassed: true,
    plugins: {},
    error: "",
  };
  for (let i = 0; i < pluginList.length; i++) {
    const { plugins } = pluginRegistry;
    const pluginNeeded = pluginList[i];
    const pluginFetchPayload: PluginReturnPayload = yield getPlugin(
      pluginNeeded
    );
    const { error, plugin } = pluginFetchPayload;

    if (plugin) {
      plugins[pluginNeeded] = plugin;
    } else if (error) {
      pluginRegistry["error"] = error;
      pluginRegistry["checkPassed"] = false;
    }
  }

  return pluginRegistry;
}

export function* pollingBackend(instance: PluginInstance) {
  //@ts-ignore
  const instanceDetails = yield instance.get();
  const timeout = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  const shouldWait = () => {
    const returnValue = ![
      PollStatus.CANCELLED,
      PollStatus.ERROR,
      PollStatus.SUCCESS,
    ].includes(instanceDetails.data.status);
    return returnValue;
  };
  while (shouldWait()) {
    yield timeout(6000);
    yield instance.get();
    yield setYieldAnalysis(
      3,
      "Creating a Feed Tree",
      "process",
      `Waiting on plugin instance id ${instance.data.id} to finish....`
    );
  }
  const result = instanceDetails.data.status;
  if (
    [PollStatus.CANCELLED, PollStatus.ERROR].includes(
      instanceDetails.data.status
    )
  ) {
    return result;
  } else return result;
}

export function* createFeedWithDircopy(
  pluginList: PluginList,
  localFiles: LocalFile[],
  username: string,
  workflowType: string
) {
  yield setYieldAnalysis(
    2,
    "Creating a Feed Root Node",
    "process",
    `Uploading ${localFiles.length} files. Please wait as the files are being uploaded...`
  );
  const feedPayload: FeedReturnPayload = {
    feed: undefined,
    error: undefined,
    instance: undefined,
  };
  const client = ChrisAPIClient.getClient();
  const directoryName = `${username}/uploads/${v4()}`;

  yield uploadLocalFiles(localFiles, directoryName);
  const totalFilePaths: string[] = [];
  const filePaths = uploadFilePaths(localFiles, directoryName);

  totalFilePaths.push(filePaths);

  const data: DircopyData = {
    dir: totalFilePaths.join(","),
  };
  const dircopy = pluginList["pl-dircopy"];
  try {
    const dircopyInstance: PluginInstance = yield client.createPluginInstance(
      dircopy.data.id,
      //@ts-ignore
      data
    );
    const feed: Feed = yield dircopyInstance.getFeed();
    if (feed) {
      yield put(setFeedDetails(feed.data.id));
      yield setYieldAnalysis(2, "Created a Feed Root Node", "finish", "");
      const note: Note = yield feed.getNote();
      yield note.put({
        title: `${workflowType} analysis`,
        content: `Notes for your ${workflowType} analysis.`,
      });
      yield feed.put({
        name: `${workflowType} analysis`,
      });

      feedPayload["feed"] = feed;
    }

    feedPayload["instance"] = dircopyInstance;
  } catch (error) {
    feedPayload["error"] = error;
  }

  return feedPayload;
}

export function* createFeed(
  pluginList: string[],
  localFiles: LocalFile[],
  username: string,
  workflowType: string
) {
  yield setYieldAnalysis(1, "Plugins Registration Check", "process", "");
  const pluginRegistry: RegistrationCheck = yield checkPluginRegistration(
    pluginList
  );

  const checkPassed = pluginRegistry["checkPassed"];
  if (checkPassed === true) {
    yield setYieldAnalysis(1, "Registration Check Complete", "finish", "");
    const feedPayload: FeedReturnPayload = yield createFeedWithDircopy(
      pluginRegistry.plugins,
      localFiles,
      username,
      workflowType
    );
    return {
      feedPayload,
      plugins: pluginRegistry.plugins,
    };
  } else {
    const error = pluginRegistry["error"];
    const errorCode = `${error}. The required plugins for this workflow are ${pluginList.join(
      " , "
    )} `;
    yield setYieldAnalysis(1, "Registration Check Failed", "error", errorCode);
    yield put(stopAnalysis());
  }
}

type FeedFetch = {
  feedPayload: FeedReturnPayload;
  plugins: PluginList;
};

export function* setupFeedDetails(
  action: IActionTypeParam,
  pluginNames: string[],
  workflowType: string
) {
  const { localFiles, username } = action.payload;
  const feedFetch: FeedFetch = yield createFeed(
    pluginNames,
    localFiles,
    username,
    workflowType
  );

  if (feedFetch) {
    const { feedPayload, plugins } = feedFetch;
    const { feed, instance, error } = feedPayload;
    if (feed) {
      if (workflowType === "covidnet") {
        if (instance) {
          yield setYieldAnalysis(3, "Creating a Feed Tree", "process", "");
          const result: string = yield pollingBackend(instance);
          if (result === "finishedSuccessfully") {
            yield runCovidnetWorkflow(instance, plugins);
          }
        }
      }

      if (workflowType === "infant-freesurfer") {
        yield setYieldAnalysis(3, "Creating a Feed Tree", "process", "");
        if (instance)
          yield runFreesurferWorkflow(instance, plugins, "infant-freesurfer");
      }

      if (workflowType === "adult-freesurfer") {
        yield setYieldAnalysis(3, "Creating a Feed Tree", "process", "");
        if (instance)
          yield runFreesurferWorkflow(instance, plugins, "adult-freesurfer");
      }
      if (workflowType === "adult-freesurfer-moc") {
        yield setYieldAnalysis(3, "Creating a Feed Tree", "process", "");
        if (instance) yield runFreesurferMocWorkflow(instance, plugins);
      }

      if (workflowType === "fastsurfer") {
        yield setYieldAnalysis(3, "Creating a Feed Tree", "process", "");
        if (instance) yield runFastsurferWorkflow(instance, plugins);
      }
      if (workflowType === "fastsurfer-moc") {
        yield setYieldAnalysis(3, "Creating a Feed Tree", "process", "");
        if (instance) yield runFastsurferMocWorkflow(instance, plugins);
      }
      if (workflowType === "infant-freesurfer-age") {
        yield setYieldAnalysis(3, "Creating a Feed Tree", "process", "");
        const { infantAge } = action.payload;
        if (instance)
          yield runFreesurferWorkflow(
            instance,
            plugins,
            "infant-freesurfer-age",
            infantAge
          );
      }
      if (workflowType === "fetal-reconstruction") {
        yield setYieldAnalysis(3, "Creating a Feed Tree", "process", "");
        if (instance) yield runFetalReconstructionWorkflow(instance, plugins);
      }
    } else {
      yield put(stopAnalysis());
      yield setYieldAnalysis(
        3,
        "Cannot create a Feed Tree",
        "error",
        `${error}`
      );
    }
  }
}

export function* setupCovidnet(action: IActionTypeParam) {
  const covidnetPlugins: string[] = [
    "pl-dircopy",
    "pl-med2img",
    "pl-covidnet",
    "pl-covidnet-pdfgeneration",
  ];
  yield setupFeedDetails(action, covidnetPlugins, "covidnet");
}

export function* setupInfantFreesurfer(action: IActionTypeParam) {
  const infantFreesurferPlugins = [
    "pl-dircopy",
    "pl-pfdicom_tagSub",
    "pl-pfdicom_tagExtract",
    "pl-fshack-infant",
    "pl-multipass",
    "pl-pfdorun",
    "pl-mgz2LUT_report",
  ];
  yield setupFeedDetails(action, infantFreesurferPlugins, "infant-freesurfer");
}

export function* setupAdultFreesurfer(action: IActionTypeParam) {
  const adultFreesurferPlugins: string[] = [
    "pl-dircopy",
    "pl-pfdicom_tagSub",
    "pl-pfdicom_tagExtract",
    "pl-fshack",
    "pl-multipass",
    "pl-pfdorun",
    "pl-mgz2LUT_report",
  ];
  yield setupFeedDetails(action, adultFreesurferPlugins, "adult-freesurfer");
}

export function* setupAdultFreesurferMoc(action: IActionTypeParam) {
  const adultFreesurferMocPlugins: string[] = [
    "pl-dircopy",
    "pl-pfdicom_tagextract_ghcr",
    "pl-pfdicom_tagsub_ghcr",
    "pl-fshack_ghcr:1.0.0",
    "pl-multipass_ghcr",
    "pl-pfdorun_ghcr",
    "pl-mgz2lut_report_ghcr_m3",
  ];
  yield setupFeedDetails(
    action,
    adultFreesurferMocPlugins,
    "adult-freesurfer-moc"
  );
}

export function* setupFastsurferMoc(action: IActionTypeParam) {
  const fastsurferMocPlugins: string[] = [
    "pl-dircopy",
    "pl-pfdicom_tagextract_ghcr",
    "pl-pfdicom_tagsub_ghcr",
    "pl-fshack_ghcr:1.0.0",
    "pl-fastsurfer_inference_cpu_30",
    "pl-multipass_ghcr",
    "pl-pfdorun_ghcr",
    "pl-mgz2lut_report_ghcr_m3",
  ];
  yield setupFeedDetails(action, fastsurferMocPlugins, "fastsurfer-moc");
}

export function* setupFastsurfer(action: IActionTypeParam) {
  const fastsurferPlugins = [
    "pl-dircopy",
    "pl-pfdicom_tagExtract",
    "pl-pfdicom_tagSub",
    "pl-fshack",
    "pl-fastsurfer_inference",
    "pl-multipass",
    "pl-pfdorun",
    "pl-mgz2LUT_report",
  ];
  yield setupFeedDetails(action, fastsurferPlugins, "fastsurfer");
}

export function* setupFetalReconstruction(action: IActionTypeParam) {
  const fetalReconstructionPlugins = [
    "pl-dircopy",
    "pl-fetal-brain-mask",
    "pl-ANTs_N4BiasFieldCorrection",
    "pl-fetal-brain-assessment",
    "pl-irtk-reconstruction",
  ];
  yield setupFeedDetails(
    action,
    fetalReconstructionPlugins,
    "fetal-reconstruction"
  );
}

export function* setupInfantFreesurferAge(action: IActionTypeParam) {
  const infantFreesurferAgePlugins = [
    "pl-dircopy",
    "pl-fshack-infant",
    "pl-infantfs",
    "pl-pfdicom_tagSub",
    "pl-pfdicom_tagExtract",
    "pl-multipass",
    "pl-pfdorun",
    "pl-mgz2LUT_report",
  ];
  yield setupFeedDetails(
    action,
    infantFreesurferAgePlugins,
    "infant-freesurfer-age"
  );
}
