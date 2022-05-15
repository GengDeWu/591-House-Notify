/*

  拿到物件後先透過 houseid 檢查當前列表中有沒有相同的 houseid,

    有的話比較他們的價格，
      (O)有變動就發送 LINE Notify。
      (X)沒有變動就換下一個物件。

    沒有的話就發送 LINE Notify。
  
*/ 

const list_sheet_name = "list";
const line_notify_token = "Line Notify權杖(必填)";
const search_city = "台北市(必填)";
const search_query = "F12 選擇 Network, 複製 591 API Request url query string(必填)";

function main() {
  const house_result = get_house_data();
  const house_info = get_formated_house_info(list_sheet_name, house_result);
  const house_info_length = house_info.length;
  if (house_info_length == 0) { return }

  let list_sheet = SpreadsheetApp.getActive().getSheetByName(list_sheet_name);
  list_sheet.insertRows(2, house_info_length);

  let range = list_sheet.getRange(`A2:E${house_info_length + 1}`);
  range.setValues(house_info);
}

function get_house_data() {
  const house_result = get_house_result();
  const house_json = JSON.parse(house_result);

  //Logger.log(`house_result:${house_result}`);

  const house_array = house_json["data"]["house_list"];
  return house_array;
}

function get_house_result() {
  const house_search_host = "https://sale.591.com.tw/home/search/list";
  let house_search_url = `${house_search_host}${search_query}`;

  const header_info = get_csrf_token();
  const csrf_token = header_info[0];
  const cookie = header_info[1];
  const search_city_url_encode = encodeURIComponent(search_city);
  const search_city_number = get_region_from_query(search_query);

  const header = {
    "X-CSRF-TOKEN": csrf_token,
    "Cookie": `${cookie}; urlJumpIp=${search_city_number}; urlJumpIpByTxt=${search_city_url_encode};`,
    'Content-Type': 'application/json'
  }

  const options = {
    "method": "get",
    "headers": header,
    "muteHttpExceptions": true
  };

  const response = UrlFetchApp.fetch(house_search_url, options);

  return response.getContentText()
}

function get_region_from_query(query) {
  let reg_exp = new RegExp(".*regionid=([0-9]*).*", "gi");
  let region_number = reg_exp.exec(query)[0];

  return region_number;
}

function get_csrf_token() {
  let house_home_url = "https://sale.591.com.tw";
  let reg_exp = new RegExp("<meta name=\"csrf-token\" content=\"([A-Za-z0-9]*)\">", "gi");
  let response = UrlFetchApp.fetch(house_home_url);
  let csrf_token = reg_exp.exec(response)[1];
  const all_cookie = response.getAllHeaders()["Set-Cookie"];
  let cookie;
  for (let i = 0; i < all_cookie.length; i++) {
    if (all_cookie[i].includes("591_new_session")) {
      cookie = all_cookie[i];
      break;
    }
  }

  return [csrf_token, cookie]
}

function get_formated_house_info(search_sheet, house_result) {
  const house_result_length = house_result.length;
  if (house_result_length < 1) { return [] }

  let format_house_array = Array();
  for (let house_index = 0; house_index < house_result_length; house_index++) {

    let house_item = house_result[house_index];
    Logger.log(house_item);
    let houseid = house_item["houseid"];
    let house_price = `${house_item["price"]} W`;

    // 去除 0W 的廣告物件 and 沒有樓層資訊的廣告物件
    if (house_item["price"] == 0 || house_item["floor"] == null) {
      continue;
    }

    // 驗證是否重複
    let duplicated_price = check_house_item_no_duplicated(search_sheet, houseid);
    // 價格沒變就不通知, 有變會再通知
    if (duplicated_price == house_price) {
      continue;
    }

    let house_title = house_item["title"];
    let house_url = `https://sale.591.com.tw/home/house/detail/2/${houseid}.html`;
    let house_hyperlink = `=HYPERLINK("${house_url}", "${house_title}")`;
    let area = house_item["area"];
    let floor = house_item["floor"];

    let tmp_array = [houseid, house_hyperlink, house_price, area, floor];
    format_house_array.push(tmp_array);

    let line_message = `\n${house_title}\n${house_url}\n$ ${house_price}\n${area}坪，${floor}`;
    send_to_line_notify(line_message);
  }
  return format_house_array;
}

function check_house_item_no_duplicated(search_sheet, houseid) {
  let list_sheet = SpreadsheetApp.getActive().getSheetByName(search_sheet);
  let type_array = list_sheet.getRange("A2:A").getValues();

  for (let item_index = 0; item_index < type_array.length; item_index++) {
    if (type_array[item_index][0] == houseid) {
      let price = list_sheet.getRange(`C${item_index + 2}`).getDisplayValue();
      return price.toString()
    }
  }
  return false
}

function send_to_line_notify(message) {
  const line_notify_url = "https://notify-api.line.me/api/notify";

  const header = {
    "Authorization": `Bearer ${line_notify_token}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  }

  const payload = {
    "message": message,
    "notificationDisabled": true
  }

  const options = {
    "method": "post",
    "headers": header,
    "payload": payload,
    "muteHttpExceptions": true
  };
  
  UrlFetchApp.fetch(line_notify_url, options);
}
