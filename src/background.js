globalThis.chrome = globalThis.browser ? globalThis.browser : globalThis.chrome;

const api = globalThis.chrome;

function getProfileUserInfo(sendResponse) {
  if (!api?.identity?.getProfileUserInfo) {
    sendResponse({ email: "" });
    return;
  }

  try {
    api.identity.getProfileUserInfo({ accountStatus: "ANY" }, (profile) => {
      if (api.runtime?.lastError) {
        sendResponse({ email: "" });
        return;
      }

      sendResponse({ email: profile?.email || "" });
    });
  } catch (error) {
    sendResponse({ email: "" });
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "smartre:getProfileUserInfo") {
    return undefined;
  }

  getProfileUserInfo(sendResponse);
  return true;
});
