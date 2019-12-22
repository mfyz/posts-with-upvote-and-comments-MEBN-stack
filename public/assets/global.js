function showLoginRequiredModal() {
	$('#modalLoginRequired').modal('show')
}

function votePost(guid, isLoggedIn){
	if (!isLoggedIn) {
		showLoginRequiredModal()
		return
	}
	
	location.href='/post/' + guid + '/vote'
}

function confirmModal(question, callback, options) {
	var opts = Object.assign({
		icon: 'question-circle',
		okButtonTxt: 'Ok',
		okButtonType: 'primary',
		cancelButtonTxt: 'Cancel',
	}, options)
	var confirmModal = 
	$('<div class="modal fade">' +
		'<div class="modal-dialog" role="document">' +
			'<div class="modal-content">' +
				'<div class="modal-body text-center pt-5 pb-5">' +
					'<i class="far fa-' + opts.icon + ' fa-hg mb-4"></i>' +
					'<p class="mb-4">' + question + '</p>' +
					'<a href="#!" class="btn btn-secondary" data-dismiss="modal">' + 
						opts.cancelButtonTxt + 
					'</a>' +
					'<a href="#!" id="okButton" class="btn btn-' + opts.okButtonType + '">' + 
						opts.okButtonTxt + 
					'</a>' +
				'</div>' +
			'</div>' +
		'</div>' +
	'</div>');
	
	confirmModal.find('#okButton').click(function(event) {
		callback();
		confirmModal.modal('hide');
	}); 
	
	confirmModal.modal('show');    
};  