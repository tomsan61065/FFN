/* eslint-disable no-console */

var DEBUG_ = false;

var newshelper_cs = {

  registerObserver: () => {
    /* deal with changed DOMs (i.e. AJAX-loaded content) */
    var me = newshelper_cs;

    // MutationOberver API 用來監視 DOM 變動 
    // 1.等待所有腳本任務完成後才運行 (異步方式)
    // 2.把 DOM 變動紀錄封裝成一個數據組
    // https://developer.mozilla.org/zh-TW/docs/Web/API/MutationObserver
    // http://javascript.ruanyifeng.com/dom/mutationobserver.html
    // http://csbun.github.io/blog/2015/05/mutation-observer-and-event/

    //兼容各瀏覽器前墜
    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

    var throttle = ( () => {
      var timer_;
      return (fn, wait) => {
        if (timer_) clearTimeout(timer_);
        timer_ = setTimeout(fn, wait);
      };
    })();

    // 直接 censor 整個 document
    // 這樣才能偵測到滑鼠點選換頁的事件
    var target = document; // 目標node
    var config = { // 設定 observer 的觀察對象
      childList: true, // 子節點的變動
      attributes: true, // 屬性的變動 (監聽 href 屬性)
      characterData: true, // 節點內容或節點文本的變動
      subtree: true // 所有後代節點的變動 (設定此還需指定上述一個或多個)
      // attributeOldValue : 布林值，觀察attributes變動時，是否紀錄變動前的屬性
      // characterDateOldValue : 類似同上
      // attributeFilter : 類型為數組(ex ['class', 'src'])，表示需要觀察的特定屬性
    };
    
    // 建構函數 觀察變數 = new MutationObserver( callback )
    var mutationObserver = new MutationObserver( mutations => {

      // 與extension其他部分通訊
      // https://crxdoc-zh.appspot.com/apps/messaging
      // https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/runtime/sendMessage
      // browser.runtime.sendMessage(extensionID(optional string), message, options);
      chrome.runtime.sendMessage({method: 'page'}); // 傳遞給background.js (onRequest 那?)

      var hasNewNode = false;
      mutations.forEach( mutation => {
        if (mutation.type == 'childList' && mutation.addedNodes.length > 0) //有childList, 有新增東西會 > 1
          hasNewNode = true;
      });
      if (hasNewNode) {
        throttle( () => {
          me.censorFacebook(target); // line 106左右
        }, 1000);
      }
    });

    // (所要觀察的DOM節點, 指定觀察的特定變動(看 line 32 的 config) )
    mutationObserver.observe(target, config);
  },

  buildWarningMessage: options => `<div class="newshelper-warning-facebook">
    <div class="newshelper-arrow-up"></div>
    ${chrome.i18n.getMessage('warning')}
    <span class="newshelper-description"><span>
      <a href="${options.link}" target="_blank">${options.title}</a>
    </span></span>
  </div>`,

  buildActionBar: options => {
    //options 有 title: titleText, link: linkHref, rule: rule, action: 1
    var url = 'http://newshelper.g0v.tw';

    // !== : 如同 == 與 ===，嚴格的 != 
    // 有 link & title 會在回報頁面自動填上
    if ('undefined' !== typeof(options.title) && 'undefined' !== typeof(options.link)) {
      url += '?news_link=' + encodeURIComponent(options.link) + '&news_title= ' + encodeURIComponent(options.title);
    }
    if (DEBUG_) {
      if ('undefined' !== typeof(options.rule))   url += '&rule=' + encodeURIComponent(options.rule);
      if ('undefined' !== typeof(options.action)) url += '&action=' + encodeURIComponent(options.action);
    }
    // 從 _local 裡面抓 'reportCTA' 的 message
    return `<a href="${url}" target="_blank">${chrome.i18n.getMessage('reportCTA')}</a>`;
  },

  //改為button的修改
  buildActionBars: options => {

    var url = "https://www.youtube.com/watch?v=CAuNuoNUHqk";

    return `<button type="button" onclick="location.href='${url}'"> 
    ${chrome.i18n.getMessage('reportCTB')} </button> . <button type="button" onclick="alert('Hello :D')">click</button>`;
  },


  censorFacebook: baseNode => {
    var me = newshelper_cs;
    /*
      See FB DOM Tree hierarchy
      https://github.com/g0v/newshelper-extension/wiki/Facebook-DOM
    */

    var t1_ = Date.now();
    if (window.location.host.indexOf("www.facebook.com") !== -1) {
      /* log browsing history into local database for further warning */
      /* add warning message to a Facebook post if necessary */
      var censorFacebookNode = (containerNode, titleText, linkHref, rule) => {
        if (DEBUG_) console.log('censorFacebookNode', containerNode[0], titleText);
        while (true) {
          var matches = ('' + linkHref).match('^https?://(l|www).facebook.com/l.php\\?u=([^&]*)');
          if (matches) {
            linkHref = decodeURIComponent(matches[2]);
            continue;
          }
          break;
        }
        // 處理被加上 ?fb_action_ids=xxxxx 的情況
        matches = ('' + linkHref).match('(.*)[?&]fb_action_ids=.*');
        if (matches) linkHref = matches[1];

        containerNode = $(containerNode);
        var className = "newshelper-checked";
        if (containerNode.hasClass(className)) return;
        else containerNode.addClass(className);

        // 先看看是不是 uiStreamActionFooter, 表示是同一個新聞有多人分享, 那只要最上面加上就好了
        var addedAction = false;
        containerNode.parents('div[role=article]').find('.uiStreamActionFooter').each( (idx, uiStreamSource) => {
          $(uiStreamSource).find('li:first').append(' · ' + me.buildActionBar({
            title: titleText,
            link: linkHref,
            rule: rule,
            action: 1
          })
          // 以下為新增buildActionBars
           + ' . ' + me.buildActionBars({
            title: titleText,
            link: linkHref,
            rule: rule,
            action: 1
           }));
          addedAction = true;
        });

        // 再看看單一動態，要加在 .uiStreamSource
        if (!addedAction) {
          containerNode.parents('div[role=article]').find('.uiStreamSource').each( (idx, uiStreamSource) => {
            $($('<span></span>').html(me.buildActionBar({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 2
            }) + ' · ' + me.buildActionBars({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 2
            }) + ' . ')).insertBefore(uiStreamSource);

            addedAction = true;
            // should only have one uiStreamSource
            if (idx != 0) console.error(idx + titleText);
          });
        }

        // 再來有可能是有人說某個連結讚
        if (!addedAction) {
          containerNode.parents('div.storyInnerContent').find('.uiStreamSource').each( (idx, uiStreamSource) => {
            $(
              $('<span></span>').html(me.buildActionBar({
                title: titleText,
                link: linkHref,
                rule: rule,
                action: 3
              }) + ' · ' + me.buildActionBars({
                title: titleText,
                link: linkHref,
                rule: rule,
                action: 3
              }) + ' . ')
            ).insertBefore(uiStreamSource);
            addedAction = true;
          });
        }

        // 再來是個人頁面
        if (!addedAction) {
          containerNode.parents('div[role="article"]').siblings('.uiCommentContainer').find('.UIActionLinks').each( (idx, uiStreamSource) => {
            $(uiStreamSource).append(' · ').append(me.buildActionBar({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 4
            }) + ' . ' + me.buildActionBars({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 4
            }));
            addedAction = true;
          });
        }

        // 新版Timeline
        if (!addedAction) {
          containerNode.parents('._4q_').find('._6p-').find('._5ciy').find('._6j_').each( (idx, shareAction) => {
            $(
              $('<a class="_5cix"></a>').html(me.buildActionBar({
                title: titleText,
                link: linkHref,
                rule: rule,
                action: 5
              }) + ' . ' + me.buildActionBars({
                title: titleText,
                link: linkHref,
                rule: rule,
                action: 5
              }))
            ).insertAfter(shareAction);
            addedAction = true;
          });
        }

        if (!addedAction) {
          containerNode.parents('.UFICommentContentBlock').find('.UFICommentActions').each( (idx, foo) => {
            $(foo).append(' · ', me.buildActionBar({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 6
            }) + ' . ' + me.buildActionBars({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 6
            }));
            addedAction = true;
          });
        }
        if (!addedAction) {
          // this check should be after UFICommentContent
          containerNode.parents('._5pax').find('._5pcp').each( (idx, foo) => {
            $(foo).append(' · ', me.buildActionBar({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 7
            }) + ' . ' + me.buildActionBars({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 7
            }));
            addedAction = true;
          });
        }

        // 再來是single post
        if (!addedAction) {
          containerNode.parents('div[role="article"]').find('._5pcp._5lel').each( (idx, uiStreamSource) => {
            $(uiStreamSource).append(' · ').append(me.buildActionBar({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 8
            }) + ' . ' + me.buildActionBars({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 8
            }));
            addedAction = true;
          });
        }

        if (!addedAction) {
          containerNode.siblings().find('.uiCommentContainer').find('.UIActionLinks').each( (idx, foo) => {
            $(foo).append(' · ', me.buildActionBar({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 9
            }) + ' . ' + me.buildActionBars({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 9
            }));
            addedAction = true;
          });
        }

        if (!addedAction) {
          containerNode.parents('.userContentWrapper').find('._5vsi > div').each( (idx, foo) => {
            $(foo).append(' · ', me.buildActionBar({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 10
            }) + ' . ' + me.buildActionBars({
              title: titleText,
              link: linkHref,
              rule: rule,
              action: 10
            }));
            addedAction = true;
          });
        }

        if (DEBUG_ && !addedAction) console.error('fail to insert actionbar ' + rule);

        /* log the link first */
        chrome.runtime.sendMessage({
          method: 'log_browsed_link',
          title: titleText,
          link: linkHref
        });

        me.check_report(titleText, linkHref, report => {
          containerNode.addClass(className);
          containerNode.append(me.buildWarningMessage({
            title: report.report_title,
            link: report.report_link
          }));
        });
      };


      /* my timeline */
      $(baseNode)
        .find(".uiStreamAttachments")
        .not(".newshelper-checked")
        .each( (idx, uiStreamAttachment) => {
          uiStreamAttachment = $(uiStreamAttachment);
          var titleText = uiStreamAttachment.find(".uiAttachmentTitle").text();
          var linkHref = uiStreamAttachment.find("a").attr("href");
          censorFacebookNode(uiStreamAttachment, titleText, linkHref, 'rule1');
        });

      $(baseNode)
        .find("._5rwo")
        .not(".newshelper-checked")
        .each( (idx, userContent) => {
          userContent = $(userContent);
          var titleText = userContent.find(".fwb").text();
          var linkHref = userContent.find("a").attr("href");
          censorFacebookNode(userContent, titleText, linkHref, 'rule2');
        });

      /* 這個規則會讓按讚也被誤判是連結
      $(baseNode)
      .find("._42ef")
      .not(".newshelper-checked")
      .each( (idx, userContent) => {
        userContent = $(userContent);
        var titleText = userContent.find(".fwb").text();
        var linkHref = userContent.find("a").attr("href");
        censorFacebookNode(userContent, titleText, linkHref, 'rule3');
      });*/

      /* others' timeline, fan page */
      $(baseNode)
        .find(".shareUnit")
        .not(".newshelper-checked")
        .each( (idx, shareUnit) => {
          shareUnit = $(shareUnit);
          var titleText = shareUnit.find(".fwb").text();
          var linkHref = shareUnit.find("a").attr("href");
          censorFacebookNode(shareUnit, titleText, linkHref, 'rule4');
        });

      $(baseNode)
        .find("._5rny")
        .not(".newshelper-checked")
        .each( (idx, userContent) => {
          userContent = $(userContent);
          var titleText = userContent.find(".fwb").text();
          var linkHref = userContent.find("a").attr("href");
          censorFacebookNode(userContent, titleText, linkHref, 'rule5');
        });

      /* post page (single post) */
      $(baseNode)
        .find("._6kv")
        .not(".newshelper-checked")
        .each( (idx, userContent) => {
          userContent = $(userContent);
          var titleText = userContent.find(".mbs").text();
          var linkHref = userContent.find("a").attr("href");
          censorFacebookNode(userContent, titleText, linkHref, 'rule6');
        });

      /* post page (single post) */
      $(baseNode)
        .find("._6m3")
        .not(".newshelper-checked")
        .each( (idx, userContent) => {
          userContent = $(userContent);
          var titleText = userContent.find("a").text();
          var linkHref = userContent.find("a").attr("href");
          censorFacebookNode(userContent.parents('._2r3x').find('._6m3').parents('._6m2').parent(), titleText, linkHref, 'rule7');
        });
    }

    if (DEBUG_) console.log('censorFacebook time', Date.now() - t1_);
  },

  check_report: (title, url, cb) => {
    // 從 db 中判斷 title, url 是否是錯誤新聞，是的話執行 cb 並傳入資訊
    if (!url) return;

    chrome.runtime.sendMessage({
      method: 'check_report',
      title: title,
      url: url
    }).then( ret => {
      if (ret !== false && ret)
        cb(ret);
    }, error => {
      console.error(`Error: ${error}`);
    });
  },

  sync_report_data: () => {
    // 叫 background 開始跟 api server 同步資料
    chrome.runtime.sendMessage({method: 'start_sync_db'});
  },

  init: () => {
    var me = newshelper_cs;

    if (document.location.hostname == 'www.facebook.com') {
      var target = document.getElementById("contentArea") || document.getElementById("content");
      if (target) {
        me.censorFacebook(target);
        me.registerObserver();
      }
      else {
        console.error('#contentArea or #content is not ready');
      }
    }
    else {
      me.check_report('', document.location.href, report => {
        chrome.runtime.sendMessage({ method: 'page' });
        document.body.style.border = "5px solid red";
        chrome.runtime.sendMessage({
          method: 'add_notification',
          title: chrome.i18n.getMessage("warning").replace(/<\/?b>/g, ''),
          body: report.report_title,
          link: report.report_link
        });
      });
    }

    me.sync_report_data();
  }
};
newshelper_cs.init();

