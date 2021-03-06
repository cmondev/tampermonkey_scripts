// ==UserScript==
// @name         YouTube Reaction Overview Advanced
// @namespace    https://cmon.dev
// @version      0.1
// @description  Shows the amount of likes and dislikes of a YouTube video on main page, subscriptions page, search and trends
// @author       Simon Hofer
// @include      https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      googleapis.com
// ==/UserScript==

const API_KEY = "YourYtApiKey";
const BASE_URL = "https://www.googleapis.com/youtube/v3/videos?part=statistics&key=" + API_KEY + "&id=";

const ID_STATS_MAP = {};

const UNIQUE_IDS = new Set();

(function() {
    window.addEventListener("load", function(event) {
        addRootObserver();
        getCurrentElementAndEvalData();
    });
})();

function getCurrentElementAndEvalData() {
    const root = document.querySelector("#content #page-manager");
    const currentElement = root.querySelector("[role='main']");
    getIdsAndQueryData(getVideoAnchorElements(currentElement));
}

/**
 * Returns a list of \<a\> elements
 * @param {Node} element Either a \<ytd-search\> or a \<ytd-browse\> element
 * @returns {NodeList} list of <a> elements
 */
function getVideoAnchorElements(element) {
    let elements = [];
    const tagName = element.tagName.toLowerCase();
    switch(tagName) {
        case "ytd-search":
            elements = element.querySelectorAll("ytd-video-renderer #video-title");
            break;

        case "ytd-browse":
            elements = getCorrectElementsForYtdBrowse(element);
            break;

        default:
            break;
    }

    return elements;
}

function getCorrectElementsForYtdBrowse(element) {
    const pageSubType = element.getAttribute("page-subtype");

    if(pageSubType === "subscriptions") {
        return element.querySelectorAll("ytd-grid-video-renderer #video-title");
    }
    else if(pageSubType === "home") {
        return element.querySelectorAll("ytd-rich-grid-media #video-title-link");
    }
    // Either "trends" or something else
    else {
        return element.querySelectorAll("ytd-video-renderer #video-title");
    }
}

/**
 * @function
 * Creates a MutationObserver to observe if the user changed the section. Also creates MutationObservers for observing a change on the current section (= newly loaded videos)
 */
function addRootObserver() {
    const root = document.querySelector("#content #page-manager");
    if(!root) {
        window.setTimeout(addRootObserver, 500);
        return;
    }

    // At the moment of the first page visit either just one <ytd-browse> element or one <ytd-search> element exists
    const elementsToObserve = root.querySelectorAll("ytd-browse, ytd-search");
    elementsToObserve.forEach( (element) => {
        addSubObserver(element);
    });

    // if the user switches to a section he has not visited before a new node will be added. Also observe this node
    const observerOptions = {childList: true};
    const observer = new MutationObserver(function(mutationList, observer) {
        mutationList.forEach( (mutation) => {
            if (!mutation.addedNodes) {
                return
            }

            for (let i = 0; i < mutation.addedNodes.length; i++) {
                const node = mutation.addedNodes[i];
                const tagName = node.tagName.toLowerCase();
                if(tagName === "ytd-search" || tagName === "ytd-browse") {
                    addSubObserver(node);
                }
            }
        });
    });

    observer.observe(root, observerOptions);
}

/**
 * @function
 * Adds a MutationObserver to the given node. Observes if the section has changed or if new elements were loaded.
  * @param {Node} node
 */
function addSubObserver(node) {
    const observerOptions = {attributes: true, attributeFilter: ["role"], childList: true, subtree: true};

    const observer = new MutationObserver(function(mutationList, observer) {
        mutationList.forEach( (mutation) => {
            if(mutation.type === "attributes" && mutation.target.getAttribute("role") === "main") {
                const current_elements = getVideoAnchorElements(mutation.target);
                getIdsAndQueryData(current_elements);
            }

            if(mutation.type === "childList" && mutation.addedNodes && mutation.addedNodes.length > 0) {
                let addedElements = new Set();
                mutation.addedNodes.forEach( (addedNode) => {
                    if(addedNode.tagName) {
                        const tagName = addedNode.tagName.toLowerCase();
                        if(tagName === "ytd-video-renderer" ||
                           tagName === "ytd-rich-item-renderer" ||
                           tagName === "ytd-grid-video-renderer") {

                            const linkElement = addedNode.querySelectorAll("a")[1];
                            const id = getVideoIdFromUrl(linkElement.href);
                            if(!UNIQUE_IDS.has(id)) {
                                UNIQUE_IDS.add(id);
                                addedElements.add(linkElement);
                            }
                        }
                    }
                });

                if(addedElements.size > 0) {
                    getIdsAndQueryData(Array.from(addedElements));
                }
            }
        });
    });
    observer.observe(node, observerOptions);
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
