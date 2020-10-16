// ==UserScript==
// @name         YouTube Reaction Overview Basic
// @namespace    https://cmon.dev
// @version      0.1
// @description  Shows the amount of likes and dislikes of a YouTube video before clicking it
// @author       Simon Hofer
// @include      https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      googleapis.com
// ==/UserScript==

const API_KEY = "YourYtApiKey";
const BASE_URL = "https://www.googleapis.com/youtube/v3/videos?part=statistics&key=" + API_KEY + "&id=";

const ID_STATS_MAP = {};

(function() {
    window.addEventListener("load", function(event) {
        const elements = getElementsForVideos();
        getIdsAndQueryData(elements);
    });
})();

function getElementsForVideos() {
    const root = document.querySelector("#content #page-manager");

    if(!root) {
        window.setTimeout(getElementsForVideos, 500);
        return;
    }

    const elements = root.querySelectorAll("ytd-grid-video-renderer #video-title");

    return elements;
}

/**
 * Slices a list of \<a>\ elements to 50 (YT API call limit is 50 ids) and queries the data from the YT API
 * @param {NodeList|Array<Object>} elements List containing \<a\> elements
 */
function getIdsAndQueryData(elements) {
    if(elements.length > 0) {
        const ids = Array.from(elements).map(e => getVideoIdFromUrl(e.href));

        const slices = 50;
        const sliced_ids = new Array(Math.ceil(ids.length / slices))
        .fill().map(_ => ids.splice(0, slices));

        for(let id_slice of sliced_ids) {
            queryAndWriteData(id_slice, elements);
        }
    }
    else {
        console.log("No elements found");
    }
}

function getVideoIdFromUrl(url) {
    return url.split("&t=")[0].split("watch?v=")[1];
}

/**
 * Queries the YT API and writes the likes and dislikes to the corresponding DOM elements
 * @param {Array<Number>} ids List of video ids
 * @param {NodeList|Array<Object>} elements List containing \<a\> elements
 */
function queryAndWriteData(ids, elements) {
    console.log("Fetching yt api data");
    const urlToRequest = BASE_URL + ids.join("&id=");
    GM_xmlhttpRequest({
        method: "GET",
        url: urlToRequest,
        responseType: "json",
        onload: function(response) {
            handleApiResponse(response.response);

            for(let el of elements) {
                const id = getVideoIdFromUrl(el.href);
                if(ID_STATS_MAP[id]) {
                    writeLikesAndDislikesToDom(el, ID_STATS_MAP[id].likes, ID_STATS_MAP[id].dislikes);
                }
            }
        }
    });
}

/**
 * Filters the YT API call and maps likes and dislikes of a video to its id
 * @param {Object} response The response of the YT API call
 */
function handleApiResponse(response) {
    if(response.items.length > 0) {
        for(var item of response.items) {
            const id = item.id;
            const stats = item.statistics;
            const likes = stats.likeCount;
            const dislikes = stats.dislikeCount;

            ID_STATS_MAP[id] = {"likes": likes, "dislikes": dislikes};
        }
    }
}

/**
 * Creates a \<div\> element for each likes and dislikes and appends the \<div\> elements to the parrent of the given \<a\> element
 * @param {Node} element \<a\> element of the video
 * @param {Number} likes Amount of likes
 * @param {Number} dislikes Amount of dislikes
 */
function writeLikesAndDislikesToDom(element, likes, dislikes) {
    let likesElements = element.parentElement.getElementsByClassName("likes");
    if(likesElements.length !== 0) {
        element.parentElement.removeChild(likesElements[0]);
    }
    let likesElement = createDiv("likes", likes, "green");
    element.parentElement.appendChild(likesElement);

    let dislikesElements = element.parentElement.getElementsByClassName("dislikes");
    if(dislikesElements.length !== 0) {
        element.parentElement.removeChild(dislikesElements[0]);
    }
    let dislikesElement = createDiv("dislikes", dislikes, "red");
    element.parentElement.appendChild(dislikesElement);
}

function createDiv(className, text, color) {
    let el = document.createElement("div");
    el.setAttribute("style", "color: " + color);
    el.setAttribute("class", className);
    el.innerText = text;

    return el;
}
