import axios from "axios";
import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const headers = { "User-Agent": UA };

// ===== Weibo 热搜 =====
async function fetchWeibo() {
  try {
    // 多个备用接口
    const endpoints = [
      "https://weibo.com/ajax/side/hotSearch",
      "https://weibo.com/ajax/statuses/hot_band",
    ];
    let data;
    for (const url of endpoints) {
      try {
        const resp = await axios.get(url, {
          headers: {
            ...headers,
            Referer: "https://weibo.com/",
            Accept: "application/json",
          },
          timeout: 10000,
        });
        data = resp.data;
        break;
      } catch {
        continue;
      }
    }
    if (!data) throw new Error("All Weibo endpoints failed");

    // 兼容两种返回格式
    const raw = data.data?.realtime || data.data?.band_list || [];
    const list = raw.slice(0, 20).map((item, i) => ({
      rank: i + 1,
      keyword: item.word || item.word_scheme?.word || item.note || "",
     热度: item.raw_hot || item.num || item.num_topic || 0,
      url: item.word_scheme
        ? `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word_scheme.word)}`
        : "",
      label: item.label_name || "",
    }));
    return { platform: "weibo", name: "微博热搜", total: list.length, list };
  } catch (e) {
    return { platform: "weibo", name: "微博热搜", error: e.message };
  }
}

// ===== 百度热搜 =====
async function fetchBaidu() {
  try {
    const { data } = await axios.get(
      "https://top.baidu.com/board?tab=realtime",
      { headers, timeout: 10000 }
    );
    const $ = cheerio.load(data);
    const list = [];
    $(".category-wrap_iQLoo .content_1YWBm").each((i, el) => {
      if (i >= 20) return false;
      const title = $(el).find(".c-single-text-ellipsis").text().trim();
      const hot = $(el).find(".hot-index_1Bl1a").text().trim();
      const desc = $(el).find(".desc_3CTjT").text().trim();
      if (title) {
        list.push({ rank: i + 1, keyword: title, heat: hot, desc });
      }
    });
    return { platform: "baidu", name: "百度热搜", total: list.length, list };
  } catch (e) {
    return { platform: "baidu", name: "百度热搜", error: e.message };
  }
}

// ===== B站热门 =====
async function fetchBilibili() {
  try {
    const { data } = await axios.get(
      "https://api.bilibili.com/x/web-interface/popular?ps=20",
      { headers, timeout: 10000 }
    );
    const list = (data.data?.list || []).map((item, i) => ({
      rank: i + 1,
      keyword: item.title,
      desc: item.desc || "",
      plays: item.stat?.view || 0,
      danmaku: item.stat?.danmaku || 0,
      url: `https://www.bilibili.com/video/${item.bvid}`,
      author: item.owner?.name || "",
    }));
    return { platform: "bilibili", name: "B站热门", total: list.length, list };
  } catch (e) {
    return { platform: "bilibili", name: "B站热门", error: e.message };
  }
}

// ===== 知乎热榜 =====
async function fetchZhihu() {
  try {
    // 使用 jsDelivr 镜像的知乎热榜数据，绕过反爬
    const { data } = await axios.get(
      "https://api.zhihu.com/topstory/hot-lists/total?limit=20",
      {
        headers: {
          ...headers,
          Referer: "https://www.zhihu.com/hot",
          Origin: "https://www.zhihu.com",
        },
        timeout: 10000,
      }
    );
    const list = (data.data || []).map((item, i) => ({
      rank: i + 1,
      keyword: item.target?.title || "",
      excerpt: (item.target?.excerpt || "").slice(0, 120),
      heat: item.detail_text || "",
      url: item.target?.url || "",
    }));
    if (!list.length) throw new Error("Empty list");
    return { platform: "zhihu", name: "知乎热榜", total: list.length, list };
  } catch {
    // 备用：HTML页面提取
    try {
      const { data } = await axios.get(
        "https://www.zhihu.com/hot",
        {
          headers: { ...headers, Referer: "https://www.zhihu.com/", "Accept-Language": "zh-CN" },
          timeout: 10000,
        }
      );
      const $ = cheerio.load(data);
      const list = [];
      $("script#js-initialData").each((i, el) => {
        try {
          const json = JSON.parse($(el).html() || "");
          const items = json?.initialState?.topstory?.hotList || [];
          items.slice(0, 20).forEach((item, j) => {
            list.push({
              rank: j + 1,
              keyword: item.target?.title || item.title || "",
              excerpt: (item.target?.excerpt || "").slice(0, 120),
              heat: item.target?.detail_text || "",
              url: item.target?.url || "",
            });
          });
        } catch {}
      });
      if (list.length) {
        return { platform: "zhihu", name: "知乎热榜", total: list.length, list };
      }
      throw new Error("No data found");
    } catch (e2) {
      return { platform: "zhihu", name: "知乎热榜", error: "Zhihu blocked: " + (e2.message || "unknown") };
    }
  }
}

// ===== 抖音热搜 =====
async function fetchDouyin() {
  try {
    const { data } = await axios.get(
      "https://www.douyin.com/aweme/v1/web/hot/search/list/",
      { headers: { ...headers, Referer: "https://www.douyin.com" }, timeout: 10000 }
    );
    const list = (data.data?.word_list || []).slice(0, 20).map((item, i) => ({
      rank: i + 1,
      keyword: item.word || "",
      heat: item.hot_value || 0,
    }));
    return { platform: "douyin", name: "抖音热搜", total: list.length, list };
  } catch (e) {
    return { platform: "douyin", name: "抖音热搜", error: e.message };
  }
}

// ===== 汇总 =====
export async function scrapeAll() {
  const [weibo, baidu, bilibili, zhihu, douyin] = await Promise.all([
    fetchWeibo(),
    fetchBaidu(),
    fetchBilibili(),
    fetchZhihu(),
    fetchDouyin(),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    platforms: [weibo, baidu, bilibili, zhihu, douyin],
  };
}

import { normalize } from "path";
import { fileURLToPath } from "url";

// 直接运行: node src/scraper.js
if (process.argv[1]) {
  const scriptPath = normalize(process.argv[1]);
  const modulePath = normalize(fileURLToPath(import.meta.url));
  if (scriptPath === modulePath) {
    scrapeAll().then((d) => console.log(JSON.stringify(d, null, 2)));
  }
}
