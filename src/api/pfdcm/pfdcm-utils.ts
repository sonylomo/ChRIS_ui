import { PACSPatient, PACSStudy } from ".";

/**
 * Parse Raw DCM Data
 */

interface RawDcmData {
  status: string;
  command: string;
  data: RawDcmObject[];
  args: {
    [argument: string]: string | number | boolean;
  }
}

interface RawDcmObject {
  [label: string]: RawDcmItem | RawDcmObject[];
}

interface RawDcmItem {
  tag: number | string;
  value: number | string;
  label: string;
}

const isRawDcmItem = (item: RawDcmItem | RawDcmObject[]): item is RawDcmItem => (
  (item as RawDcmObject[]).length === undefined
);

function parseRawDcmValue(label: string, item: RawDcmItem) {
  const { value } = item;

  // treat as dates (typescript forbids fallthrough switches)
  const dateLabels = [
    'StudyDate',
    'PatientBirthDate'
  ]

  // treat as numbers
  const numberLabels = [
    'NumberOfStudyRelatedInstances', 
    'NumberOfStudyRelatedSeries',
    'NumberOfSeriesRelatedInstances',
  ];

  if (typeof value === 'string') {
    if (dateLabels.includes(label)) {
      const date = new Date();
      date.setFullYear(parseInt(value.slice(0, 4)));
      date.setMonth(parseInt(value.slice(4, 6)));
      date.setDate(parseInt(value.slice(6)));
      return date;
    }
    if (numberLabels.includes(label)) {
      return parseInt(value);
    }
  }

  return value;
}


export function flattenDcmArray(dcmArray: RawDcmObject[]) {
  return dcmArray.map((dcmObject) => {
    const flatObject: any = {};
    const labels = Object.keys(dcmObject);

    for (const label of labels) {
      const item = dcmObject[label];

      // @NOTE: This causes more problems than its worth
      // DCM labels are in PascalCase; converts to camelCase for typescript convention
      // const camelCaseLabel = `${label[0].toLowerCase()}${label.slice(1)}`;

      if (isRawDcmItem(item)) {
        flatObject[label] = parseRawDcmValue(label, item);
      } else {
        flatObject[label] = flattenDcmArray(item);
      }
    }

    return flatObject as PACSStudy;
  });
}

// Parses raw DCM object returned by PFDCM, transforms to more usable `PACSStudy[]` structure
export function parseRawDcmData(rawData: RawDcmData): PACSStudy[] {
  return flattenDcmArray(rawData.data);
}

/**
 * Sort PACS Studies into PACS Patients.
 * @param studies PACS Study array to turn into patient array
 * @returns PACS Patient array
 */
export function sortStudiesByPatient(studies: PACSStudy[]): PACSPatient[] {
  const patientsStudies : { [id: string]: PACSStudy[] } = {}; // map of patient ID : studies
  const patients: { [id: string]: PACSPatient } = {}; // map of patient ID: patient data

  // sort studies by patient ID
  for (const study of studies) {
    const processedStudies = patientsStudies[study.PatientID] || [];
    patientsStudies[study.PatientID] = [ ...processedStudies, study ];
    
    if (!patients[study.PatientID]) {
      patients[study.PatientID] = {
        PatientID: study.PatientID,
        PatientName: study.PatientName,
        PatientSex: study.PatientSex,
        PatientBirthDate: study.PatientBirthDate,
        studies: []
      }
    }
  }

  // combine sorted studies and patient data
  for (const patientId of Object.keys(patientsStudies)) {
    patients[patientId] = {
      ...patients[patientId],
      studies: patientsStudies[patientId]
    }
  }

  return Object.values(patients);
}
