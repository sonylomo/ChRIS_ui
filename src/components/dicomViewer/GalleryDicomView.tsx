import React from "react";
import { ErrorBoundary } from "react-error-boundary";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneMath from "cornerstone-math";
import * as cornerstoneNIFTIImageLoader from "cornerstone-nifti-image-loader";
import * as cornerstoneFileImageLoader from "cornerstone-file-image-loader";
import * as cornerstoneWebImageLoader from "cornerstone-web-image-loader";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as cornerstoneTools from "cornerstone-tools";
import { import as csTools } from "cornerstone-tools";
import Hammer from "hammerjs";
import CornerstoneViewport from "react-cornerstone-viewport";
import {
  Backdrop,
  Bullseye,
  Spinner,
  Drawer,
  DrawerPanelContent,
  DrawerContent,
  DrawerContentBody,
  DrawerPanelBody,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
} from "@patternfly/react-core";
import { useTypedSelector } from "../../store/hooks";
import GalleryWrapper from "../gallery/GalleryWrapper";
import * as dicomParser from "dicom-parser";
import { isDicom, isNifti } from "./utils";
import DicomHeader from "./DcmHeader/DcmHeader";
import DicomLoader from "./DcmLoader";
import DicomTag from "./DicomTag";
import GalleryModel from "../../api/models/gallery.model";
import { Image, GalleryState } from "./types";
import { DataNode } from "../../store/explorer/types";

cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.Hammer = Hammer;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
cornerstoneTools.init();
cornerstoneNIFTIImageLoader.external.cornerstone = cornerstone;
cornerstoneFileImageLoader.external.cornerstone = cornerstone;
cornerstoneWebImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

const scrollToIndex = csTools("util/scrollToIndex");
cornerstoneNIFTIImageLoader.nifti.configure({
  headers: {
    "Content-Type": "application/vnd.collection+json",
    Authorization: "Token " + window.sessionStorage.getItem("CHRIS_TOKEN"),
  },
  method: "get",
  responseType: "arrayBuffer",
});
const ImageId = cornerstoneNIFTIImageLoader.nifti.ImageId;

function getInitialState() {
  return {
    inPlay: false,
    imageIds: [],
    activeTool: "Zoom",
    totalFiles: 0,
    filesParsed: 0,
    numberOfFrames: 1,
    tools: [
      {
        name: "Zoom",
        mode: "active",
        modeOptions: { mouseButtonMask: 2 },
      },

      {
        name: "Pan",
        mode: "active",
        modeOptions: { mouseButtonMask: 1 },
      },
      {
        name: "Wwwc",
        mode: "active",
        modeOptions: { mouseButtonMask: 1 },
      },
      {
        name: "StackScrollMouseWheel",
        mode: "active",
      },
      { name: "Magnify", mode: "active" },
    ],
    frameRate: 22,
    frame: 1,
    visibleHeader: false,
  };
}

const GalleryDicomView = (props: { files?: DataNode[] }) => {
  const _rfiles = useTypedSelector((state) => state.explorer.selectedFolder);
  const files = props.files || _rfiles;
  const [galleryDicomState, setGalleryDicomState] =
    React.useState<GalleryState>(getInitialState);

  const {
    inPlay,
    totalFiles,
    filesParsed,
    visibleHeader,
    frameRate,
    frame,
    tools,
    activeTool,
    imageIds,
    numberOfFrames,
  } = galleryDicomState;
  const element = React.useRef<HTMLElement | undefined>(undefined);
  const currentImage = React.useRef<Image | undefined>(undefined);

  const loadImagesIntoCornerstone = React.useCallback(
    async (dcmArray: DataNode[]) => {
      const imageIds: string[] = [];
      let numberOfFrames = 0;

      for (let i = 0; i < dcmArray.length; i++) {
        const item = dcmArray[i];
        setGalleryDicomState((state) => {
          return {
            ...state,
            filesParsed: i + 1,
          };
        });

        if (item.file) {
          const file = item.file;
          const fname = item.file.data.fname;
          if (isNifti(fname)) {
            const fileArray = fname.split("/");
            const fileName = fileArray[fileArray.length - 1];
            const imageIdObject = ImageId.fromURL(
              `nifti:${file.url}${fileName}`
            );
            const numberOfSlices = cornerstone.metaData.get(
              "multiFrameModule",
              imageIdObject.url
            ).numberOfFrames;
            imageIds.push(
              ...Array.from(
                Array(numberOfSlices),
                (_, i) =>
                  `nifti:${imageIdObject.filePath}#${imageIdObject.slice.dimension}-${i},t-0`
              )
            );
            numberOfFrames = numberOfSlices;
          } else {
            if (isDicom(fname)) {
              const file = await item.file.getFileBlob();
              imageIds.push(
                cornerstoneWADOImageLoader.wadouri.fileManager.add(file)
              );
              numberOfFrames = imageIds.length;
            } else {
              const file = await item.file.getFileBlob();
              imageIds.push(cornerstoneFileImageLoader.fileManager.add(file));
              numberOfFrames = imageIds.length;
            }
          }
        }
      }

      if (imageIds.length > 0) {
        setGalleryDicomState((state) => {
          return {
            ...state,
            imageIds,
            numberOfFrames,
          };
        });
      }
    },
    []
  );

  React.useEffect(() => {
    if (files && files.length > 0) {
      const dcmArray = getUrlArray(files);
      setGalleryDicomState((state) => {
        return {
          ...state,
          totalFiles: dcmArray.length,
        };
      });
      loadImagesIntoCornerstone(dcmArray);
    }
  }, [files, loadImagesIntoCornerstone]);

  const toolExecute = (tool: string) => {
    runTool(tool);
  };

  const handleOpenImage = (cmdName: string) => {
    runTool("openImage", cmdName);
  };

  const setPlayer = (status: boolean) => {
    setGalleryDicomState({
      ...galleryDicomState,
      inPlay: status,
    });
  };

  const handleGalleryActions = {
    next: () => {
      handleOpenImage("next");
    },
    previous: () => {
      handleOpenImage("previous");
    },
    play: () => {
      setGalleryDicomState({
        ...galleryDicomState,
        inPlay: !inPlay,
      });
      handleOpenImage("play");
    },
    pause: () => {
      setGalleryDicomState({
        ...galleryDicomState,
        inPlay: !inPlay,
      });

      handleOpenImage("pause");
    },
    first: () => {
      handleOpenImage("first");
    },
    last: () => {
      handleOpenImage("last");
    },

    zoom: () => {
      toolExecute("Zoom");
    },

    pan: () => {
      toolExecute("Pan");
    },

    wwwc: () => {
      toolExecute("Wwwc");
    },
    invert: () => {
      toolExecute("Invert");
    },

    magnify: () => {
      toolExecute("Magnify");
    },
    rotate: () => {
      toolExecute("Rotate");
    },
    stackScroll: () => {
      toolExecute("StackScroll");
    },
    reset: () => {
      toolExecute("Reset");
    },

    dicomHeader: () => {
      toolExecute("DicomHeader");
    },
  };

  const runCinePlayer = (cmdName: string) => {
    switch (cmdName) {
      case "play": {
        setPlayer(true);
        break;
      }

      case "pause": {
        setPlayer(false);
        break;
      }

      case "next": {
        if (frame < numberOfFrames) {
          const nextFrame = frame + 1;

          setGalleryDicomState({
            ...galleryDicomState,
            frame: nextFrame,
          });
          scrollToIndex(element.current, frame + 1);
        }

        break;
      }
      case "previous": {
        if (frame > 1) {
          const previousFrame = frame - 1;
          setGalleryDicomState({
            ...galleryDicomState,
            frame: previousFrame,
          });
          scrollToIndex(element.current, frame - 1);
        }
        break;
      }

      case "first": {
        const frame = 1;
        setGalleryDicomState({
          ...galleryDicomState,
          frame,
        });

        scrollToIndex(element.current, 0);

        break;
      }

      case "last": {
        const frame = numberOfFrames;
        setGalleryDicomState({
          ...galleryDicomState,
          frame: frame,
        });
        scrollToIndex(element.current, frame - 1);
        break;
      }
    }
  };

  const runTool = (toolName: string, opt?: any) => {
    switch (toolName) {
      case "openImage": {
        runCinePlayer(opt);
        break;
      }
      case "Wwwc": {
        if (activeTool === "Wwwc") return;

        setGalleryDicomState({
          ...galleryDicomState,
          activeTool: "Wwwc",
        });
        break;
      }
      case "Pan": {
        if (activeTool === "Pan") return;

        setGalleryDicomState({
          ...galleryDicomState,
          activeTool: "Pan",
        });
        break;
      }
      case "Zoom": {
        if (activeTool === "Zoom") return;

        setGalleryDicomState({
          ...galleryDicomState,
          activeTool: "Zoom",
        });
        break;
      }
      case "Invert": {
        const viewport = cornerstone.getViewport(element.current);
        viewport.invert = !viewport.invert;
        cornerstone.setViewport(element.current, viewport);
        break;
      }

      case "Magnify": {
        if (activeTool === "Magnify") return;

        setGalleryDicomState({
          ...galleryDicomState,
          activeTool: "Magnify",
        });
        break;
      }
      case "Rotate": {
        const viewport = cornerstone.getViewport(element.current);
        viewport.rotation += 90;
        cornerstone.setViewport(element.current, viewport);
        break;
      }

      case "StackScroll": {
        if (activeTool === "StackScrollMouseWheel") return;

        setGalleryDicomState({
          ...galleryDicomState,
          activeTool: "StackScrollMouseWheel",
        });
        break;
      }

      case "DicomHeader": {
        setGalleryDicomState({
          ...galleryDicomState,
          visibleHeader: !visibleHeader,
        });
        break;
      }

      case "Reset": {
        cornerstone.reset(element.current);
        break;
      }
    }
  };

  const toggleHeader = () => {
    setGalleryDicomState({
      ...galleryDicomState,
      visibleHeader: !visibleHeader,
    });
  };

  const panelContent = (
    <DrawerPanelContent
      style={{
        backgroundColor: "#f0f0f0",
      }}
    >
      <DrawerHead>
        <DrawerActions>
          <DrawerCloseButton onClick={toggleHeader} />
        </DrawerActions>
      </DrawerHead>
      <DrawerPanelBody>
        <DicomTag image={currentImage.current} />
      </DrawerPanelBody>
    </DrawerPanelContent>
  );

  return (
    <GalleryWrapper
      total={totalFiles > 0 ? totalFiles : 0}
      handleOnToolbarAction={(action: string) => {
        (handleGalleryActions as any)[action].call();
      }}
      listOpenFilesScrolling={inPlay}
    >
      <React.Suspense fallback={<FallBackComponent />}>
        {imageIds.length === 0 ? (
          <DicomLoader totalFiles={totalFiles} filesParsed={filesParsed} />
        ) : (
          <React.Fragment>
            <DicomHeader
              handleToolbarAction={(action: string) => {
                (handleGalleryActions as any)[action].call();
              }}
            />
            <ErrorBoundary FallbackComponent={FallBackComponent}>
              <div className="ami-viewer">
                <Drawer isExpanded={visibleHeader}>
                  <DrawerContent panelContent={panelContent}>
                    <DrawerContentBody>
                      <div id="container">
                        <CornerstoneViewport
                          isPlaying={inPlay}
                          frameRate={frameRate}
                          activeTool={activeTool}
                          tools={tools}
                          imageIds={imageIds}
                        />
                      </div>
                    </DrawerContentBody>
                  </DrawerContent>
                        </Drawer>
              </div>
            </ErrorBoundary>
          </React.Fragment>
        )}
      </React.Suspense>
    </GalleryWrapper>
  );
};

/**
 * Only dicom files can be viewed through the gallery.
 *
 * @param feedFiles
 * @returns files
 */

const getUrlArray = (feedFiles: DataNode[]) => {
  const dcmFiles = feedFiles.filter((item: DataNode) => {
    if (item.file) return GalleryModel.isValidDcmFile(item.file.data.fname);
  });

  return dcmFiles;
};

export default GalleryDicomView;

const FallBackComponent = () => {
  return (
    <Backdrop>
      <Bullseye>
        <Spinner />
      </Bullseye>
    </Backdrop>
  );
};
