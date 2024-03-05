// Copyright 2019 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Tentacles API handler for Campaign Manager Conversions
 * uploading (DfaReport API).
 */

'use strict';

const {
  api: { dfareporting: { DfaReporting, ConversionsConfig } },
  utils: { getProperValue, BatchResult },
} = require('@google-cloud/nodejs-common');
const { ApiHandler } = require('./api_handler.js');

/**
 * Conversions per request. Campaign Manager has a limit as 1000.
 * see https://developers.google.com/doubleclick-advertisers/quotas
 */
const RECORDS_PER_REQUEST = 1000;
/**
 * Queries per second. Campaign Manager has a limit as 1.
 * see https://developers.google.com/doubleclick-advertisers/quotas
 */
const QUERIES_PER_SECOND = 1;
const NUMBER_OF_THREADS = 10;

/**
 * Configuration for a Campaign Manager(CM) conversions upload.
 * For CM conversions uploading, a 'profileId' is required as
 * 'ConversionsConfig' suggests. But here a property 'cmAccountId' (CM
 * account Id) exists instead. The reason is that different users(email based)
 * have different profiles for the same CM account. In order NOT to bind the
 * configuration to a specific user(email), the function uses CM
 * account Id plus current user(email) to get the current profile. After that,
 * put the profileId into the 'ConversionsConfig' and invoke the function
 * to upload conversions.
 *
 * @typedef {{
 *   cmAccountId:string,
 *   recordsPerRequest:(number|undefined),
 *   qps:(number|undefined),
 *   numberOfThreads:(number|undefined),
 *   cmConfig:!ConversionsConfig,
 *   secretName:(string|undefined),
 * }}
 */
let CampaignManagerConfig;

/**
 * Conversion upload for Campaign Manager.
 */
class CampaingManagerConversionUpload extends ApiHandler {

  /** @override */
  getSpeedOptions(config) {
    const recordsPerRequest =
      getProperValue(config.recordsPerRequest, RECORDS_PER_REQUEST);
    const numberOfThreads =
      getProperValue(config.numberOfThreads, NUMBER_OF_THREADS, false);
    const qps = getProperValue(config.qps, QUERIES_PER_SECOND);
    return { recordsPerRequest, numberOfThreads, qps };
  }

  /**
   * Sends out the data as conversions to Campaign Manager (CM).
   * Gets the CM user profile based on CM account Id and current user, then uses
   * the profile to send out data as CM conversions with speed control and data
   * volume adjustment.
   * @param {string} records Data to send out as conversions. Expected JSON
   *     string in each line.
   * @param {string} messageId Pub/sub message ID for log.
   * @param {!CampaignManagerConfig} config
   * @return {!Promise<BatchResult>}
   * @override
   */
  sendData(records, messageId, config) {
    const dfaReporting = new DfaReporting(this.getOption(config));
    return this.sendDataInternal(dfaReporting, records, messageId, config);
  };

  /**
   * Sends out the data as conversions to Campaign Manager (CM).
   * Gets the CM user profile based on CM account Id and current user, then uses
   * the profile to send out data as CM conversions with speed control and data
   * volume adjustment.
   * This function exposes a DfaReporting parameter for test.
   * @param {DfaReporting} dfaReporting Injected DfaReporting instance.
   * @param {string} records Data to send out as conversions. Expected JSON
   *     string in each line.
   * @param {string} messageId Pub/sub message ID for log.
   * @param {!CampaignManagerConfig} config
   * @return {!Promise<BatchResult>}
   */
  async sendDataInternal(dfaReporting, records, messageId, config) {
    const profileId = await dfaReporting.getProfileId(config.cmAccountId);
    config.cmConfig.profileId = profileId;
    const managedSend = this.getManagedSendFn(config);
    const configedUpload = dfaReporting.getUploadConversionFn(config.cmConfig);
    return managedSend(configedUpload, records, messageId);
  };
}

/** API name in the incoming file name. */
CampaingManagerConversionUpload.code = 'CM';

module.exports = {
  CampaignManagerConfig,
  CampaingManagerConversionUpload,
};
