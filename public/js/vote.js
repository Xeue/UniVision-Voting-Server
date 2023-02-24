var $ = jQuery;

function buildVotes(uniObj) {
	$('#vote_cUniCont').html("");
	$('#vote_row').html("");
	uniObj.forEach(uni => {
		let $cont = $(`<div class="vote_act" style="background-image:url(${uni.actImage});"></div>`);
		$cont.prop("id", "vote_" + uni.PK);
		let $bttn = $('<button class="vote_submit" type="button">Place Vote</button>');
		let $lbl = $('<div class="vote_act_text"></div>');
		$lbl.html(uni.act);
		$cont.append($bttn);
		$cont.append($lbl);
		$('#vote_row').append($cont);
		let $uniImg = $('<img>');
		$uniImg.prop("src", uni.logo);
		let $uniBttn = $("<button type='button' class='vote_choose_uni' id='vote_chUni_" + uni.PK + "'></button>");
		$uniBttn.append($uniImg);
		$('#vote_cUniCont').append($uniBttn);
	})
}

function getUni(PK) {
	for (let index = 0; index < uni.length; index++) {
		if (uni[index].PK == PK) return uni[index]
	}
}

function selectUni(uniID) {
	$("#vote_closed").addClass("hidden_left");
	$("#vote_early").addClass("hidden_left");
	$("#vote_select").addClass("hidden_left");
	$('#vote_email_extension').html(getUni(uniID).email);
	$('#vote_uni_name').html(getUni(uniID).name);
	$("#vote_verify").removeClass("hidden_right");
	$('#vote_' + uniID).remove();
	$('.vote_uni_logo').children("img").prop("src", getUni(uniID).logo);
}

var selectedUni = 0;

$(document).ready(function () {

	$("main").addClass("disconnected");
	
	const webConnection = new webSocket(host, 'Browser', version, true);
	webConnection.addEventListener('message', event => {
		const [header, payload] = event.detail;
		socketDoMessage(header, payload);
	});
	webConnection.addEventListener('open', () => {
		socketDoOpen(webConnection);
		$('main').removeClass('disconnected');
	});
	webConnection.addEventListener('close', () => {
		$('main').addClass('disconnected');
	});

	let selected = false;
	$("#vote_header").css("opacity", 1);
	$(document).click(function (e) {
		$target = $(e.target);
		if ($target.hasClass('vote_choose_uni')) {
			selectedUni = $target.attr("id").replace("vote_chUni_", "");
			$('#vote_' + selectedUni).remove();
			Cookies.set('university', selectedUni, {
				secure: true,
				SameSite: 'Lax'
			});
			selectUni(selectedUni);
		} else if ($target.is("#vote_alternate_button")) {
			$("#vote_verify").addClass("hidden_left");
			$("#vote_alternate").removeClass("hidden_right");
		} else if ($target.is("#vote_next")) {
			let email = $('#vote_email').val();
			if (email == "" || email.length < 7) {
				alert("Please enter a valid email");
			} else {
				let wsMsg = {};
				wsMsg.type = "voteStart";
				wsMsg.email = email;
				wsMsg.fromUni = Number(selectedUni);
				webConnection.send(wsMsg);
			}
		} else if ($target.is("#vote_next_alternate")) {
			let email = $('#vote_alternate_email').val();
			let code = $('#vote_alternate_code').val();
			if (code.length != 6 || code == "" || email == "" || email.length < 4) {
				alert("Please enter a valid email and voter code");
			} else {
				let wsMsg = {};
				wsMsg.type = "voteStart";
				wsMsg.email = email;
				wsMsg.code = code;
				wsMsg.fromUni = Number(selectedUni);
				webConnection.send(wsMsg);
			}
		} else if ($target.hasClass("vote_submit")) {
			if (selected == false) {
				alert("Please select and act!");
			} else {
				let wsMsg = {};
				wsMsg.type = "vote";
				wsMsg.act = Number(selected);
				wsMsg.PK = sessionPK;
				webConnection.send(wsMsg);
			}
		} else if ($target.hasClass('vote_act')) {
			selected = $target.attr("id").replace("vote_", "");
			$target.addClass("act_selected");
			$target.siblings().removeClass("act_selected");
		}
	});
});

function socketDoOpen(socket) {
	if (confirmation) {
		$("vote_confirming").addClass("hidden_left");
		$("#vote_confirm").removeClass("hidden_right");
		socket.send({"type":"voteConfirm","confirmationCode":findGetParameter("code")});
	}
}

function socketDoMessage(header, payload) {
	if (payload.type == "voteRegistered") {
		sessionPK = payload.PK;
		$("#vote_verify").addClass("hidden_left");
		$("#vote_alternate").addClass("hidden_left");
		$("#vote_choose").removeClass("hidden_right");
	} else if (payload.type == "voteInvalidCode") {
		alert("The code was invalid!");
	} else if (payload.type == "voteSaved") {
		$("#vote_choose").addClass("hidden_left");
		$("#vote_thanks").removeClass("hidden_right");
	} else if (payload.type == "voteAlready") {
		$("#vote_verify").addClass("hidden_left");
		$("#vote_alternate").addClass("hidden_left");
		$("#vote_already").removeClass("hidden_right");
	} else if (payload.type == "voteStatus") {
		if (payload.status == "OPEN") {
			selectedUni = Cookies.get('university');
			if (selectedUni !== undefined) {
				selectUni(selectedUni);
			} else {
				$('#vote_select').removeClass('hidden_right');
				$('#vote_select').siblings().each(function () {
					if ($(this).is("#vote_early") || $(this).is("#vote_closed")) {
						$(this).addClass("hidden_left");
					} else {
						$(this).removeClass("hidden_left");
						$(this).addClass("hidden_right");
					}
				});
			}
		} else if (payload.status == "CLOSED") {
			$('#vote_closed').removeClass('hidden_left');
			$('#vote_closed').siblings().each(function () {
				if ($(this).is("#vote_early")) {
					$(this).addClass("hidden_left");
				} else {
					$(this).removeClass("hidden_left");
					$(this).addClass("hidden_right");
				}
			});
		} else {
			$('#vote_early').removeClass('hidden_left');
			$('#vote_early').siblings().each(function () {
				if ($(this).is("#vote_closed")) {
					$(this).addClass("hidden_left");
				} else {
					$(this).removeClass("hidden_left");
					$(this).addClass("hidden_right");
				}
			});
		}
	} else if (payload.type == "voteActs") {
		uni = payload.data;
		buildVotes(uni);
	}
}

function findGetParameter(parameterName) {
	var result = null,
	tmp = [];
	location.search.substr(1).split("&").forEach(function (item) {
		tmp = item.split("=");
		if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
	});
	return result;
}