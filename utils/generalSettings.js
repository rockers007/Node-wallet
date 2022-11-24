const axios = require('axios').default;
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const GeneralSetting = require('../adminModules/generalSettings/models/generalSettingModel');
const OtherSetting = require('../adminModules/generalSettings/models/otherSettingModel');
const CampaignSettings = require('../adminModules/campaignSettings/models/campaignSettingModel');
const TaxonomySetting = require('../adminModules/taxonomySettings/models/taxonomySettingModel');
const currencyModel = require('../adminModules/currencies/models/currencyModel');
const paymentGatewayModel = require('../adminModules/manageAPI/models/paymentGatewayModel');
const languageModel = require('../adminModules/languages/models/languageModel');
const socialSignupModel = require('../adminModules/manageAPI/models/socialSignupModel');
const manageDropdownModel = require('../adminModules/manageDropdowns/models/manageDropdownModel');
const campaignCategoryModel = require('../adminModules/manageDropdowns/models/campaignCategoryModel');
const categoryModel = require('../adminModules/categories/models/categoryModel');
const userTypeModel = require('../adminModules/userType/models/userTypeModel');
const Currency = require('../adminModules/currencies/models/currencyModel');
module.exports = class generalSettings {
  async getgeneralSettings(key = '') {
    const siteSetting =
      key == ''
        ? await GeneralSetting.findOne().sort({ _id: -1 })
        : await GeneralSetting.findOne().select(key).sort({ _id: -1 });
    return siteSetting;
  }

  async getTaxonomySettings() {
    const taxonomySetting = await TaxonomySetting.findOne().sort({ _id: -1 });
    return taxonomySetting;
  }

  async getcampaignSettings() {
    const campaignSetting = await CampaignSettings.findOne().sort({ _id: -1 });
    return campaignSetting;
  }

  async getpaymentGatewayDetail(paymentType) {
    const paymentGatewayData = await paymentGatewayModel.findOne({
      paymentType: paymentType,
    });
    return paymentGatewayData;
  }

  async getpaymentGatewayById(paymentId) {
    const paymentGatewayData = await paymentGatewayModel.findById(paymentId);
    return paymentGatewayData;
  }

  async getcurrencyIdBySymbolAndCode(equityCurrencyCode, equityCurrencySymbol) {
    const currencyData = await currencyModel
      .findOne({
        code: equityCurrencyCode,
        symbol: equityCurrencySymbol,
      })
      .sort({ _id: -1 });
    return currencyData.id;
  }

  async getDefaultLanguage() {
    const campaignSetting = await languageModel
      .findOne({ isDefault: true })
      .select('_id');
    return campaignSetting;
  }

  async getOauthData(oauthType) {
    const oauthData = await socialSignupModel.findOne({
      socialType: oauthType,
    });
    return oauthData;
  }

  async getQRCodeToAuth(email, appName, secret) {
    try {
      return {
        url: await QRCode.toDataURL(
          authenticator.keyuri(email, appName, secret)
        ),
        email,
      };
    } catch (err) {
      return console.error(err);
    }
  }

  async verifyQRCodeToAuth(code, secret) {
    return authenticator.check(code, secret);
  }

  async getGoogleAccountData(token) {
    let userData = new Object();
    try {
      await axios
        .get(
          'https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Access-Control-Allow-Origin': true,
              'Access-Control-Allow-Private-Network': true,
            },
          }
        )
        .then((response) => {
          userData.result = 'success';
          userData.firstName = response.data.names[0].givenName;
          userData.lastName = response.data.names[0].familyName;
          userData.email = response.data.emailAddresses[0].value;
          userData.photo = response.data.photos[0].url;
          userData.uniqueGoogleId = response.data.resourceName.replace(
            'people/',
            ''
          );
          userData.active = 1;
        });
    } catch (err) {
      userData.err = err;
      userData.result = 'fail';
    }
    return userData;
  }

  async getLinkedInAccountData(token) {
    const linkedinAPI1 =
      'https://api.linkedin.com/v2/me/?projection=(id,firstName,lastName,profilePicture,emailAddress)';
    const linkedinAPI2 =
      'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))';
    let userData = new Object();
    try {
      await axios
        .get(linkedinAPI1, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Access-Control-Allow-Origin': true,
            'Access-Control-Allow-Private-Network': true,
          },
        })
        .then((response) => {
          userData.result = 'success';
          userData.firstName = response.data.firstName.localized.en_US;
          userData.lastName = response.data.lastName.localized.en_US;
          userData.uniqueLinkedInId = response.data.id;
        });
      await axios
        .get(linkedinAPI2, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => {
          userData.email = response.data.elements[0]['handle~'].emailAddress;
        });
    } catch (err) {
      userData.err = err;
      userData.result = 'fail';
    }
    return userData;
  }

  async getDefaultUsertype() {
    const usertype = await userTypeModel.findOne({
      isDefault: 'yes',
    });
    return usertype;
  }

  async getOtherSettings(key = '') {
    const siteSetting =
      key == ''
        ? await OtherSetting.findOne().sort({ _id: -1 })
        : await OtherSetting.findOne().select(key).sort({ _id: -1 });
    return siteSetting;
  }

  async manageMasterDropdownUse(id, useCount) {
    await manageDropdownModel.findByIdAndUpdate(id, { $inc: { useCount } });
    return true;
  }

  async manageUserTypeUse(id, useCount) {
    await userTypeModel.findByIdAndUpdate(id, { $inc: { useCount } });
    return true;
  }

  async manageCampaignCategoryUse(id, useCount) {
    await campaignCategoryModel.findByIdAndUpdate(id, { $inc: { useCount } });
    return true;
  }

  async manageCategoryUse(id, useCount) {
    await categoryModel.findByIdAndUpdate(id, { $inc: { useCount } });
    return true;
  }
  async manageCurrencyUse(id, useCount) {
    await Currency.findByIdAndUpdate(id, { $inc: { useCount } });
    return true;
  }

  toCommas(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  /* getTimzoneWiseDateFormat(date = new Date){
    const timeZone = 'Asia/Kolkata';
    return date.toLocaleString("en-US", {timeZone: `${timeZone}`});
  } */
};
